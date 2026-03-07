# DID ISBE - DID Generator

DID generator for `did:isbe` along with its associated cryptographic proof.

## Requirements

- Node.js >= 20
- npm >= 10

## Usage

```bash
npm install
chmod +x did-gen
./did-gen did -p 0x<PRIVATE_KEY>

# Example using all short options
./did-gen did -p 0x<PRIVATE_KEY> -c secp256k1 -m uc
```

### Available options

| Option | Description | Default |
|------|-------------|---------|
| `-p, --privKey <hex>` | Private key (32-byte hex) | required |
| `-c, --curve <string>` | Accepted curves: `secp256k1` or `P-256` | `secp256k1` |
| `-m, --modelDeploy <string>` | Deployment identifier for `did:isbe` | `uc` |

## License

Apache-2.0

Copyright © 2025
Comunidad de Madrid & Alastria
