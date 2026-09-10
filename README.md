# DID ISBE - DID Generator

DID generator for `did:isbe` along with its associated cryptographic proof.

## Requirements

- Node.js >= 20
- npm >= 10

## Usage

```bash
npm install
chmod +x did-gen

# Generate random key pair if needed
./did-gen keys

# Generate DID in PRO environment 
./did-gen did -p 0x<PRIVATE_KEY>

# Generate DID in PRE environment 
./did-gen did -m uc-pre -p 0x<PRIVATE_KEY>
```

## Commands

### `did`

Generate a DID, public key, cryptographic proof and the associated
EVM account address (EOA) with EIP-55 checksum.

| Option | Description | Default |
|------|-------------|---------|
| `-p, --privKey <hex>` | Private key (32-byte hex) | required |
| `-c, --curve <string>` | Accepted curves: `secp256k1` or `P-256` | `secp256k1` |
| `-m, --modelDeploy <string>` | Deployment identifier for `did:isbe` | `uc` |

The EOA is derived for both supported curves. ISBE operates two EVM
networks, both running stock Hyperledger Besu — the only difference is
the `network.ecCurve` value in the `genesis.json`:

- `secp256k1` → **Case Network** (Besu default; standard Ethereum address).
- `P-256`     → **Bare Network** (Besu genesis with
  `"network": { "ecCurve": "secp256r1" }`).

In both cases the derivation is `keccak256(x || y).slice(-20)` with EIP-55
checksum applied to the output. Note that `P-256` (JWK / RFC 8812),
`secp256r1` (Besu genesis) and `prime256v1` (OpenSSL) are three names for
the same curve.

### `keys`

Generates a random EC key pair:

| Option | Description | Default |
|------|-------------|---------|
| `-c, --curve <string>` | Accepted curves: `secp256k1` or `P-256` | `secp256k1` |

## License

Apache-2.0

Copyright © 2025
Comunidad de Madrid & Alastria
