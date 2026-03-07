# DID ISBE - DID Generator

DID generator for `did:isbe` along with its associated cryptographic proof.

## Requirements

- Node.js >= 20
- npm >= 10

## Usage

```bash
npm install
chmod +x did-gen
./did-gen generate --privKey 0x<PRIVATE_KEY>
```

### Available options

| Option | Description | Default |
|------|-------------|---------|
| `--privKey <hex>` | Private key (32-byte hex) | required |
| `--curve <string>` | Accepted curves: `secp256k1` or `P-256` | `secp256k1` |
| `--modelDeploy <string>` | Deployment identifier for `did:isbe` | `uc` |

## License

Apache-2.0

Copyright © 2025
Comunidad de Madrid & Alastria
