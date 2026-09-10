# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the CLI

```bash
npm install
chmod +x did-gen

./did-gen keys                          # Generate a random key pair
./did-gen keys --curve P-256            # Using P-256 curve instead of secp256k1
./did-gen did -p 0x<PRIVATE_KEY_HEX>   # Generate a DID from an existing private key
./did-gen did -p 0x<HEX> --curve P-256 --modelDeploy uc
```

The `did-gen` shell script runs TypeScript directly via `ts-node` (transpile-only mode) — there is no compiled build step, no lint config, and no tests. `npm run did-gen -- <args>` works too, since `did-gen` is also defined as an npm script.

To type-check without running:

```bash
npx tsc --noEmit
```

## Architecture

The project is a Node.js CLI with no framework beyond `commander`. Entry point is `src/index.ts`, which wires CLI options to two command modules (`src/commands/did.ts`, `src/commands/keys.ts`) and the shared crypto helpers in `src/utils.ts`.

**Data flow for `did` command:**
1. `generateProof(privKey, curve)` — signs `keccak256(pubKeyXY)` with the private key, encodes `r || s || v` as hex.
2. `buildDID(proof, modelDeploy)` — takes the last 19 bytes of the proof, prepends a version byte (`0x00`), base58-encodes with a `z` prefix → `did:isbe:<modelDeploy>:z<base58>`.
3. Output is DID + public key + proof only — the `did` command's action in `src/index.ts` does **not** print the derived EOA (unlike `keys`, below). Check `src/index.ts` before assuming otherwise: this has flipped back and forth across recent commits (`publicKeyToEOA` is imported/called there only when that feature is wired in).

**Data flow for `keys` command:**
1. `generateKeys(curve)` in `src/commands/keys.ts` produces a `GeneratedKeys` object containing hex keys, JWK (private and public), JWK thumbprint (via `jose`), and the derived EOA.
2. The EOA is computed by `publicKeyToEOA` in `src/utils.ts`: `keccak256(x || y).slice(-20)` with EIP-55 checksum applied. The printed label switches between "EOA (Ethereum Address)" and "EOA (Bare Network Address)" based on `curve`.

**Key cryptographic details:**
- Two supported curves: `secp256k1` (Case Network — standard Ethereum) and `P-256` / `secp256r1` (Bare Network — Besu with custom genesis, `network.ecCurve`). EOA derivation formula is identical for both.
- `elliptic` handles EC operations; `@noble/hashes` provides Keccak-256; `jose` computes JWK thumbprints; `bs58` encodes the DID method-specific identifier.
- `src/utils.ts` contains all shared crypto primitives: `normalizePrivKey`, `getEc`, `toJwk`, `getPublicKey`, `publicKeyToEOA`, `calculateJwkThumbprint`, `toChecksumAddress`, plus `jwkToEoa` — a JWK-based EOA-derivation helper exported for external consumers (e.g. deriving an EOA from a DID Document's `publicKeyJwk`) that no CLI command currently calls.
- `src/constants.ts` holds `DID_ISBE_VERSION_BYTE = 0x00` and `DID_ISBE_METHOD_NAME = "isbe"`.
- `program.version("2.0.0")` in `src/index.ts` is hardcoded and independent of `package.json`'s `version` field — don't assume they're in sync.
