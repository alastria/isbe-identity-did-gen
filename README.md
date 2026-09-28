# DID ISBE - DID Generator

Generates the key pair and the DID you need to register in ISBE.

Your private key is stored encrypted on your machine and is never typed on
the command line, so it does not end up in your shell history or visible to
other processes.

## Quick start: register in ISBE

**Requirements:** Node.js >= 20 and npm >= 10.

### 1. Install

```bash
npm ci
npm run build
npm link
```

### 2. Generate your key pair

```bash
did-gen keys --out ./identity.keystore.json
```

You are asked for a passphrase twice. **Nothing appears as you type** — that
is expected. Your private key is saved, encrypted, in `identity.keystore.json`.

> ⚠️ **Back up `identity.keystore.json` and keep the passphrase safe.** If you
> lose either of them, your identity can never be used again. There is no way
> to recover it.

### 3. Generate your DID

Run the command for the environment you are registering in.

#### PRE

```bash
did-gen did --keystore ./identity.keystore.json --modelDeploy uc-pre
```

#### PRO

```bash
did-gen did --keystore ./identity.keystore.json
```

You are asked for the passphrase, and you get three values:

```
DID:
did:isbe:uc-pre:z1XGdkixzpYEyyDhhCwRUwMTkS4K

Public Key:
0x044b85a04a52c7b20bccd1a09447d020dee216e161e9e7e30d77b8e9682589999...

Proof:
0x1b75ab1e0a4b568ddda980539d065418e14bf0a3388c824c5d138398f33793f5...
```

**Register the DID, Public Key and Proof with the ISBE platform.** That's it.

You can run step 3 again at any time: the same keystore always produces the
same DID.

---

## Other things you can do

### Sign transactions with your keystore

After you register, any change to your DID document (adding a key, updating
`alsoKnownAs`, revoking something…) is a transaction. The ISBE API builds it
for you unsigned; you sign it locally with your keystore:

```bash
did-gen sign-tx --keystore ./identity.keystore.json --tx-file unsigned-tx.json
```

The signed transaction is written to the terminal, ready to send back to the
API. Before signing, the tool checks that the transaction belongs to your
address. See [`sign-tx`](#sign-tx) for the full flow with `curl`.

### Encrypt a private key you already have

If you have a private key in plain text, store it in an encrypted keystore:

```bash
did-gen import-key --out ./identity.keystore.json
```

You are asked for the key (nothing appears as you type) and then for a new
passphrase. The tool prints the DID that key produces, so you can check it
matches your identity before you delete the plain-text copy. Add
`--modelDeploy uc-pre` to see the PRE DID.

If you ever typed that key on the command line, it is still in your shell
history. Clear it with `history -d` or by editing the history file.

### Decrypt a keystore to get the plain private key

If a tool needs the private key itself rather than the keystore file:

```bash
did-gen export-key --keystore ./identity.keystore.json
```

Because this shows the key in the clear, it asks you to type `yes` first. The
safest way is to send it straight to the clipboard, so it never appears on
screen:

```bash
did-gen export-key --keystore ./identity.keystore.json | pbcopy
```

Most wallets, MetaMask included, can import the keystore file directly. Check
that before exporting the key.

---

## Command reference

| Command | What it does |
|---|---|
| [`keys`](#keys) | Generates a key pair into an encrypted keystore |
| [`did`](#did) | Produces the DID, public key and proof for registration |
| [`sign-tx`](#sign-tx) | Signs a transaction built by the ISBE API |
| [`import-key`](#import-key) | Encrypts an existing private key into a keystore |
| [`export-key`](#export-key) | Decrypts a keystore back to the plain private key |

Run `did-gen <command> --help` for the options of any command.

### `keys`

Generates a key pair. By default it writes an encrypted keystore and prints
only public material, including the JWK thumbprint (the `vMethodId` used by
the registry) and the account address.

| Option | Description | Default |
|---|---|---|
| `-o, --out <file>` | Write the encrypted keystore here | — |
| `-c, --curve <string>` | `secp256k1` (only curve with keystore support) | `secp256k1` |
| `--print-private` | Print the private key in the clear instead of writing a keystore | off |
| `--passphrase-stdin` | Read the passphrase from stdin | off |

`--print-private` puts the key in your terminal scrollback. Prefer `--out`.

### `did`

Produces the DID, public key and proof — the three values ISBE needs to
register an identity.

| Option | Description | Default |
|---|---|---|
| `-k, --keystore <file>` | Encrypted keystore | — |
| `-m, --modelDeploy <string>` | `uc` for PRO, `uc-pre` for PRE | `uc` |
| `-c, --curve <string>` | `secp256k1` or `P-256` (a keystore is always secp256k1) | `secp256k1` |
| `--json` | Emit a single JSON object on stdout | off |

### `sign-tx`

Signs an unsigned transaction produced by the ISBE API and writes the signed
payload to stdout. Reads the transaction from stdin unless `--tx-file` or
`--tx` is given.

| Option | Description |
|---|---|
| `-k, --keystore <file>` | Encrypted keystore |
| `-f, --tx-file <file>` | Read the unsigned transaction from a file |
| `--tx <json>` | Unsigned transaction as a JSON string |
| `--json` | Emit a JSON object instead of the bare payload |

It refuses to sign a transaction whose `from` is not your keystore's address,
and checks that the signed payload recovers to that address before emitting
it.

It does no networking on purpose — a process holding a decrypted key should
not also be opening connections. Use it together with `curl`:

```bash
# 1. Ask the API to build the transaction
curl -s -X POST "$API/contract/<operation>" \
  -H 'content-type: application/json' \
  -d @request.json > unsigned-tx.json

# 2. Sign it locally
did-gen sign-tx -k ./identity.keystore.json -f unsigned-tx.json > signed.hex

# 3. Send it
curl -s -X POST "$API/transactions/send" \
  -H 'content-type: application/json' \
  -d "{\"signedRawTransaction\":\"$(cat signed.hex)\"}"
```

### `import-key`

Encrypts an existing private key into a keystore. Asks for the key without
echo unless a source flag is given.

| Option | Description |
|---|---|
| `-o, --out <file>` | Where to write the keystore (required) |
| `--priv-key-stdin` | Read the key from stdin |
| `-m, --modelDeploy <string>` | `uc` (PRO, default) or `uc-pre` (PRE), for the DID it shows back |
| `-p, --privKey <hex>` | **Deprecated.** Prints a warning. |

It checks that the written file decrypts back to the same key before
reporting success.

For scripts, the key can come from stdin and the passphrase from the
environment — stdin cannot carry both:

```bash
echo "$KEY" | ISBE_KEYSTORE_PASSPHRASE="$PASS" \
  did-gen import-key --out ./identity.keystore.json --priv-key-stdin
```

### `export-key`

Decrypts a keystore and prints the plain private key — the inverse of
`import-key`.

| Option | Description |
|---|---|
| `-k, --keystore <file>` | Encrypted keystore (required) |
| `--passphrase-stdin` | Read the passphrase from stdin |
| `-y, --yes` | Skip the confirmation before printing to a terminal |

When the key would appear on screen it asks you to type `yes`. Piping skips
the question, because the key never reaches the screen. The key goes to
stdout as `0x` + 64 hex characters, the same format `import-key` accepts; the
address goes to stderr, so it stays out of the pipe.

---

## Security details

### Where the key can come from

Every command that needs the private key takes exactly one key source.

| Source | Flag | Notes |
|---|---|---|
| Encrypted keystore | `--keystore <file>` | **Recommended.** Passphrase asked without echo. |
| Standard input | `--priv-key-stdin` | For scripting. Not in argv, not in history. |
| Command line | `--privKey <hex>` | **Deprecated.** Recorded in shell history and visible to any process via `ps`. Prints a warning. |

Passphrases are read from the terminal with echo off. For unattended runs,
set `ISBE_KEYSTORE_PASSPHRASE` — and only from a secret manager, because
environment variables are readable by child processes.

### The keystore

`keys --out` writes a Web3 Secret Storage v3 file — scrypt (N=262144),
AES-128-CTR, Keccak-256 MAC — created with permissions `0600` (only your user
can read it). The encryption is ethers' implementation of the standard, not
one of our own, so the file opens in geth, ethers and MetaMask, and keystores
written by those tools open here too.

Keystores are `secp256k1` only. The format has no field for a curve, and a
P-256 key stored this way would advertise an address that is not its own, so
the tool refuses instead of writing a misleading file.

### Networks and curves

ISBE operates two EVM networks, both Hyperledger Besu, differing only in
`network.ecCurve` in `genesis.json`:

- `secp256k1` → **Case Network** (standard Ethereum address).
- `P-256` → **Bare Network** (`"network": { "ecCurve": "secp256r1" }`).

In both cases the address is `keccak256(x || y).slice(-20)` with an EIP-55
checksum. `P-256`, `secp256r1` and `prime256v1` are three names for the same
curve.

Two features are Case Network (`secp256k1`) only today, and both fail with an
explicit message rather than producing something subtly wrong:

- **Keystores**, because the format cannot record a curve. P-256 keys work
  through `--priv-key-stdin`.
- **`sign-tx`**, because ethers cannot produce a P-256 signature.

`did` and `keys --print-private` work with both curves.

---

## Contributing

```bash
npm ci
npm test          # golden vectors, registry validation, keystore, signer
npm run typecheck
npm run build     # compiles to dist/
```

`src/tests/fixtures/golden-vectors.json` records the DID, proof, public key,
address and JWK thumbprint produced by v2.1.0. They are the compatibility
contract with identities already registered on-chain: a DID is derived from
its proof, and the registry re-checks that derivation on every insert. **Do
not regenerate the fixture to make a failing test pass.**

### A note on the public key and the proof

The registry validates the proof in
`DidDocumentDetailedInternal._validateProof`:

```solidity
recovered = ecrecover(keccak256(_publicKey), _proof);
require(recovered == _getAddress(_publicKey));
```

The digest hashes `_publicKey` **as received**, while `_getAddress` first
strips a leading `0x04`. The two agree only when the public key reaches the
contract as the 64-byte `X || Y` form. This tool prints the 65-byte
`0x04 || X || Y` encoding, matching previous versions and what the API
expects; the conversion happens below the API. `registry-validation.test.ts`
pins this behaviour in both directions.

## License

Apache-2.0

Copyright © 2025
Comunidad de Madrid & Alastria
