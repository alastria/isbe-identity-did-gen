# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the CLI

```bash
npm ci
chmod +x did-gen

./did-gen keys --out ./id.keystore.json      # new key pair into an encrypted keystore
./did-gen keys --print-private               # key in the clear (migration/debug only)
./did-gen did --keystore ./id.keystore.json  # DID + public key + proof
./did-gen sign-tx -k ./id.keystore.json < unsigned-tx.json
```

`did-gen` runs the TypeScript sources via `ts-node` (transpile-only). The
compiled entry point for installs is `dist/index.js`.

```bash
npm test          # jest
npm run typecheck # tsc --noEmit
npm run build     # tsc -> dist/
```

## Architecture

CLI built on `commander`. `src/index.ts` wires options to three commands
(`src/commands/{did,keys,signTx}.ts`) over a single key abstraction.

**`src/signer.ts` is the centre of the design.** Everything that needs the
private key goes through the `Signer` interface, so no command ever holds key
bytes. `LocalKeySigner` is the only implementation today; a Ledger, HSM or
Keychain backend would be a new class here and nothing else would change.
`resolveSigner()` picks the backend from the CLI options and enforces that
exactly one key source was given.

**Key material rules:**
- Never accept a private key through argv. `--privKey` still exists but warns; `--keystore` and `--priv-key-stdin` are the real paths.
- `LocalKeySigner` copies the key buffer it is handed, so callers may wipe their own copy immediately. Always pair construction with `destroy()` — `withSigner()` in `index.ts` does this in a `finally`.
- `wipe()` in `utils.ts` is best-effort: V8 strings cannot be zeroed, so it shrinks the exposure window rather than closing it.

**Data flow for `did`:**
1. `resolveSigner()` decrypts the keystore into a `LocalKeySigner`.
2. `proofFromSigner()` signs `keccak256(X || Y)` over the *unprefixed* 64-byte public key — a raw ECDSA digest signature, **not** EIP-191 `personal_sign`. A message prefix makes the on-chain `ecrecover` return the wrong address.
3. `buildDID()` takes the last 19 bytes of the proof, prepends version byte `0x00`, base58-encodes with a `z` prefix → `did:isbe:<modelDeploy>:z<base58>`.
4. The signer is destroyed in a `finally`.

**Data flow for `sign-tx`:** parse and validate the unsigned transaction
*before* decrypting anything, reject unknown fields, check `from` matches the
keystore, sign, then verify the serialised transaction recovers to the
expected address before emitting it.

**Keystore (`src/keystore.ts`):** a thin wrapper over ethers'
`encryptKeystoreJson` / `decryptKeystoreJson`, pinning scrypt N=262144
(ethers defaults to half that — a test asserts the pin). An earlier revision
implemented scrypt/AES/MAC by hand; it was replaced because the format is
identical and ethers' version is far more widely exercised. Files written by
the old implementation still open, so nothing needs migrating.

`decryptKeystore` is async and maps ethers' bad-passphrase `TypeError` to
`WrongPassphraseError`. Note that ethers returns the key as a hex string,
which V8 cannot zero — the `wipe()` on the Buffer we build from it does not
reach that string. Wiping was already best-effort; this makes the window
slightly wider.

**Keystores are secp256k1 only.** `assertKeystoreSupportsCurve` is called
before any passphrase prompt so a P-256 request fails immediately rather
than after the user types a passphrase. Do not "fix" this by storing P-256
keys anyway: the file's `address` field would be a secp256k1 address the key
does not control.

**Cryptographic details:**
- `elliptic` handles EC operations; `@noble/hashes` provides Keccak-256; `bs58` encodes the method-specific id; `ethers` provides transaction serialisation and the keystore interop tests.
- `calculateJwkThumbprint` in `utils.ts` is a native RFC 7638 implementation over `node:crypto`. It replaced `jose`, which is ESM-only and broke this CommonJS package on Node < 22.12 and under Jest. The golden vectors pin its output to what `jose` produced — do not "simplify" it by adding `alg` to the canonical JSON.
- `src/constants.ts` holds `DID_ISBE_VERSION_BYTE`, `DID_ISBE_METHOD_NAME` and `CLI_VERSION`. `CLI_VERSION` is asserted against `package.json` by `version.test.ts`; update both together.

## Tests — read before changing crypto

`src/tests/fixtures/golden-vectors.json` was captured from v2.1.0 **before**
the keystore refactor. It is the compatibility contract with identities
already on-chain: the DID is derived from the proof and
`DidDocumentDetailedInternal._validateProof` re-checks that derivation on
every insert, so a changed proof means a changed DID and an unreproducible
identity. **Never regenerate the fixture to make a test pass.**

`registry-validation.test.ts` reimplements the on-chain check in TypeScript.
Note the asymmetry it pins: `_validateProof` hashes `_publicKey` raw, while
`_getAddress` strips a leading `0x04` first, so validation succeeds only when
the public key reaches the contract as 64 bytes. The CLI prints the 65-byte
form; the conversion happens below the API.

## Scope limits

- `sign-tx` is secp256k1 (Case Network) only. Bare Network uses P-256, which `ethers` cannot sign; the code fails loudly instead of emitting a bad signature.
- `sign-tx` does no network I/O on purpose. Piping into `curl` is the intended workflow.
- `scripts/utils.ts` in the `isbe-identity-did-api` repo contains a second, copy-pasted implementation of `selfSign`/`buildDID`/`normalizePrivKey`. It is not covered by these tests and will drift; deduplicating it is pending work.
