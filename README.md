# DID ISBE - DID Generator

DID generator for `did:isbe` along with its associated cryptographic proof,
and a local signer for the transactions the did:isbe API builds.

The private key never appears on the command line, in your shell history, or
in `ps` output. It lives in an encrypted keystore and is decrypted in memory
only for as long as a single command needs it.

## Requirements

- Node.js >= 20
- npm >= 10

## Quick start

```bash
npm install
chmod +x did-gen

# 1. Create an identity key, stored encrypted (you are prompted for a passphrase)
./did-gen keys --out ./identity.keystore.json

# 2. Produce the three values the ISBE platform asks for
./did-gen did --keystore ./identity.keystore.json

# 3. Later, sign the transactions the API returns for that identity
./did-gen sign-tx --keystore ./identity.keystore.json < unsigned-tx.json

# Already have a key from an older version? Move it into a keystore:
./did-gen import-key --out ./identity.keystore.json
```

## Registering an identity, step by step

### 1. Create the key

```bash
./did-gen keys --out ./identity.keystore.json
```

The passphrase is asked twice and is not echoed — nothing appears as you
type, which is expected:

```
Choose a keystore passphrase:
Repeat the passphrase:
```

Only public material comes back:

```
Encrypted keystore written to ./identity.keystore.json (mode 0600).
Back it up: without the file and its passphrase the DID cannot be used again.

Public Key (hex):
0x043befb33de8069270cbc97805a45e07dd60c87cbe6b0f2a267e925a85c7fc96ff...

Public Key (JWK) Thumbprint - use as vMethodId:
DGNbZJY2X6EBvybDGTIKU4AcAclk26u9xU35wx0o7mA

EOA (Ethereum Address):
0x2f422D86173c6A018CB617320219d32e4215007d
```

Keep the thumbprint: it is the `vMethodId` the registry expects for this
key's verification method. The private key is already inside the keystore,
encrypted, and is never displayed.

### 2. Generate the DID

```bash
./did-gen did --keystore ./identity.keystore.json --modelDeploy uc-pre
```

```
DID:
did:isbe:uc-pre:z1kXhJiHYAGcXyNCqzEHXLaf8UR8

Public Key:
0x043befb33de8069270cbc97805a45e07dd60c87cbe6b0f2a267e925a85c7fc96ff...

Proof:
0xc9d86c1724ccd8673c96be8bedf22ee61fd1502fc366c2f43dd6a287c34441b61...

EOA: 0x2f422D86173c6A018CB617320219d32e4215007d
```

**DID, Public Key and Proof are the three values the ISBE platform needs.**
`--json` emits them as one object if you are assembling an API request:

```bash
./did-gen did -k ./identity.keystore.json --json
```

```json
{
  "did": "did:isbe:uc:z1kXhJiHYAGcXyNCqzEHXLaf8UR8",
  "publicKey": "0x04...",
  "proof": "0xc9...",
  "eoa": "0x2f422D86173c6A018CB617320219d32e4215007d",
  "curve": "secp256k1"
}
```

`--modelDeploy` selects the environment: `uc` (default), `uc-pre`, `uc-dev`.

The proof is deterministic, so running `did` again on the same keystore
always produces the same DID. Re-run it as often as you like.

### 3. Afterwards: changing the DID document

Creating the first DID document is done by the registry administrator — that
call is gated on-chain by `_DID_REGISTRY_ROLE`. Every later operation on the
document (`addVerificationMethod`, `updateBaseDocument`, `updateAlsoKnownAs`
and so on) is signed by the identity holder, and that is what `sign-tx` is
for. See the `sign-tx` section below.

### Migrating a key you already have

`import-key` moves an existing private key into a keystore. With no source
flag it asks for the key at the terminal, without echo, so a migration never
puts the key on a command line:

```bash
./did-gen import-key --out ./identity.keystore.json --modelDeploy uc-pre
```

```
Private key (64 hex chars, 0x optional):
Choose a keystore passphrase:
Repeat the passphrase:

Encrypted keystore written to ./identity.keystore.json (mode 0600), and verified readable.

DID:
did:isbe:uc-pre:z1A21tLGr3Gn4TF6fumvPoQrJSqZ

EOA: 0x2c7536E3605D9C16a7a3D7b1898e529396a65c23

Check that DID against the identity you are migrating before deleting the old key.
```

The DID it prints is the one that key already produces, so you can confirm it
matches the registered identity before destroying the original. The command
also decrypts the file it just wrote and compares the key before reporting
success — an unreadable keystore here would mean a lost identity, not a
regenerable one.

Scripted, the key can come from stdin. The passphrase then has to come from
the environment, because stdin is a single stream and cannot carry both:

```bash
echo "$OLD_KEY" | ISBE_KEYSTORE_PASSPHRASE="$PASS" \
  ./did-gen import-key --out ./identity.keystore.json --priv-key-stdin
```

Once the keystore is verified, remove the old key from wherever it lived —
and remember that a key ever passed as `--privKey` is still sitting in your
shell history. `history -d`, or clear the history file.

## Where the key can come from

Every command that needs the private key takes exactly one key source.

| Source | Flag | Notes |
|---|---|---|
| Encrypted keystore | `--keystore <file>` | **Recommended.** Passphrase prompted without echo. |
| Standard input | `--priv-key-stdin` | For scripting. Not in argv, not in history. |
| Command line | `--privKey <hex>` | **Deprecated.** Recorded in shell history and readable by any process via `ps`. Prints a warning. |

Passphrases are read from the terminal with echo off. For unattended runs,
set `ISBE_KEYSTORE_PASSPHRASE` — and only from a secret manager, because
environment variables are readable by child processes and via
`/proc/<pid>/environ`.

## The keystore

`keys --out` writes a Web3 Secret Storage v3 file — scrypt (N=262144),
AES-128-CTR, Keccak-256 MAC — created with mode `0600`. The encryption is
ethers' implementation of the format rather than one of our own, so the file
is the standard one: it opens in geth, ethers and MetaMask, and imports into
Besu tooling for the Case Network. Keystores written by those tools open
here too.

**Keystores are `secp256k1` only.** The v3 format has no field for a curve,
and a P-256 key stored this way would advertise a secp256k1 address that is
not its own, so the CLI refuses instead of writing a misleading file. P-256
keys still work through `--priv-key-stdin` for `did` and `keys
--print-private`; keystore support for the Bare Network is pending.

**Back up the file and remember the passphrase.** Losing either means the DID
can never be used again — there is no recovery path.

## Commands

### `keys`

Generates a key pair. By default it writes an encrypted keystore and prints
only public material.

| Option | Description | Default |
|---|---|---|
| `-o, --out <file>` | Write the encrypted keystore here | — |
| `-c, --curve <string>` | `secp256k1` (only curve with keystore support) | `secp256k1` |
| `--print-private` | Print the private key in the clear instead of writing a keystore | off |
| `--passphrase-stdin` | Read the passphrase from stdin | off |

`--print-private` exists for migration and debugging. It puts the key in your
terminal scrollback, so prefer `--out`.

### `did`

Generates the DID, public key and proof. These three values are what the ISBE
platform needs in order to register the identity.

| Option | Description | Default |
|---|---|---|
| `-k, --keystore <file>` | Encrypted keystore | — |
| `-c, --curve <string>` | `secp256k1` or `P-256` (a keystore is always secp256k1) | `secp256k1` |
| `-m, --modelDeploy <string>` | Deployment identifier for `did:isbe` | `uc` |
| `--json` | Emit a single JSON object on stdout | off |

```bash
./did-gen did --keystore ./identity.keystore.json --modelDeploy uc-pre
```

### `import-key`

Moves an existing private key into an encrypted keystore. Prompts for the key
without echo unless a source flag is given.

| Option | Description |
|---|---|
| `-o, --out <file>` | Where to write the keystore (required) |
| `-c, --curve <string>` | `secp256k1` or `P-256` |
| `--priv-key-stdin` | Read the key hex from stdin |
| `-p, --privKey <hex>` | **Deprecated.** Warns. |
| `-m, --modelDeploy <string>` | Environment for the DID it reports back |

Verifies the written file decrypts back to the same key before reporting
success, and prints the DID so you can confirm it matches the identity being
migrated.

### `sign-tx`

Signs an unsigned transaction produced by the did:isbe API and writes the raw
signed payload to stdout. Reads the transaction from stdin unless `--tx-file`
or `--tx` is given.

| Option | Description |
|---|---|
| `-k, --keystore <file>` | Encrypted keystore |
| `-f, --tx-file <file>` | Read the unsigned transaction from a file |
| `--tx <json>` | Unsigned transaction as a JSON string |
| `--json` | Emit a JSON object instead of the bare payload |

It refuses to sign a transaction whose `from` is not this keystore's address,
and it verifies that the signed payload recovers to that address before
emitting it.

This command performs no network I/O by design — a process holding a
decrypted key should not also be opening sockets. Compose it with `curl`:

```bash
# Ask the API to build the transaction
curl -s -X POST "$API/contract/insertFirstDidDocument" \
  -H 'content-type: application/json' \
  -d @insert-request.json > unsigned-tx.json

# Sign it locally
./did-gen sign-tx -k ./identity.keystore.json -f unsigned-tx.json > signed.hex

# Send it
curl -s -X POST "$API/transactions/send" \
  -H 'content-type: application/json' \
  -d "{\"signedRawTransaction\":\"$(cat signed.hex)\"}"
```

## Networks and curves

ISBE operates two EVM networks, both stock Hyperledger Besu differing only in
`network.ecCurve` in `genesis.json`:

- `secp256k1` → **Case Network** (Besu default; standard Ethereum address).
- `P-256` → **Bare Network** (Besu genesis with `"network": { "ecCurve": "secp256r1" }`).

In both cases the address is `keccak256(x || y).slice(-20)` with an EIP-55
checksum. `P-256` (JWK / RFC 8812), `secp256r1` (Besu genesis) and
`prime256v1` (OpenSSL) are three names for the same curve.

Two things are secp256k1-only today, and both fail with an explicit message
rather than producing something subtly wrong:

- **Keystores.** The v3 format cannot record a curve. P-256 keys go through
  `--priv-key-stdin`.
- **`sign-tx`.** ethers cannot produce a P-256 signature, so a Bare Network
  transaction would be rejected on-chain.

`did` and `keys --print-private` work with both curves. Bare Network support
means revisiting those two points.

## A note on the public key and the proof

The registry validates the proof in
`DidDocumentDetailedInternal._validateProof`:

```solidity
recovered = ecrecover(keccak256(_publicKey), _proof);
require(recovered == _getAddress(_publicKey));
```

The digest hashes `_publicKey` **as received**, while `_getAddress` first
strips a leading `0x04`. The two therefore agree only when the public key
reaches the contract as the 64-byte `X || Y` form. This CLI prints the
65-byte `0x04 || X || Y` encoding, matching previous versions and what the
API layer expects; the conversion happens below the API. `registry-validation.test.ts`
pins this behaviour in both directions.

## Development

```bash
npm ci
npm test          # golden vectors, registry validation, keystore, signer
npm run typecheck
npm run build     # compiles to dist/
```

`src/tests/fixtures/golden-vectors.json` records the DID, proof, public key,
EOA and JWK thumbprint produced by v2.1.0. They are the compatibility
contract with identities already registered on-chain: a DID is derived from
its proof, and the registry re-checks that derivation on every insert. **Do
not regenerate the fixture to make a failing test pass.**

## License

Apache-2.0

Copyright © 2025
Comunidad de Madrid & Alastria
