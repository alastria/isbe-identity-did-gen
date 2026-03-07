# DID ISBE - DID Generator

DID generator for `did:isbe` along with its associated cryptographic proof.

## Requirements

- Node.js >= 18
- npm >= 9

## Usage

```bash
npm install
npm run did-gen --  generate --privKey 0x<PRIVATE_KEY>
```

### Available options

| Option | Description | Default |
|------|-------------|---------|
| `--privKey <hex>` | Private key (32-byte hex) | required |
| `--curve <num>` | `1=secp256k1`, `2=P-256` | `1` |
| `--modelDeploy <id>` | Deployment identifier for `did:isbe` | `uc` |
| `--debug` | `simple` / `json`  | `simple` |

## License

Apache-2.0

Copyright © 2025
Comunidad de Madrid & Alastria
