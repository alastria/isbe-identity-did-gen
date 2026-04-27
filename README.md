# DID ISBE - DID Generator

DID generator for `did:isbe` along with its associated cryptographic proof.

## Requirements

- Node.js >= 20
- npm >= 10

## Usage (Mac/Linux)

```bash
npm install
chmod +x did-gen

# Generate random key pair if needed
./did-gen keys

# Generate DID
./did-gen did -p 0x<PRIVATE_KEY>
```


## Usage (Windows)

```bash
npm install

# Generate random key pair if needed
node did-gen keys

# Generate DID
node did-gen did -p 0x<PRIVATE_KEY>
```

## Commands

### `did`

Generate a DID and proof.

| Option | Description | Default |
|------|-------------|---------|
| `-p, --privKey <hex>` | Private key (32-byte hex) | required |
| `-c, --curve <string>` | Accepted curves: `secp256k1` or `P-256` | `secp256k1` |
| `-m, --modelDeploy <string>` | Deployment identifier for `did:isbe` | `uc` |

### `keys`

Generates a random EC key pair:

| Option | Description | Default |
|------|-------------|---------|
| `-c, --curve <string>` | Accepted curves: `secp256k1` or `P-256` | `secp256k1` |

## License

Apache-2.0

Copyright © 2025
Comunidad de Madrid & Alastria
