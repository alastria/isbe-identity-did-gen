# ISBE DID Generator

Generador de did:isbe junto a su prueba criptográfica asociada.

> Este proceso se realiza de forma `off-chain` no necesitando acceso a un nodo. 


## Requisitos

- Node.js >= 18
- npm >= 9

---

## Uso

```
npm install
npm run did-gen --  generate --privKey 0x<PRIVATE_KEY>
```

### Opciones disponibles

| Opción | Descripción | Default |
|------|-------------|---------|
| `--privKey <hex>` | Private key (32 bytes hex) | requerido |
| `--curve <num>` | `1=secp256k1`, `2=P-256` | `1` |
| `--modelDeploy <id>` | Identificador de despliegue del did:isbe | `uc` |
| `--debug` | `simple` / `json`  | `simple` |

## Licencia

**Apache 2.0**
**© 2025 Comunidad de Madrid & Alastria**-
