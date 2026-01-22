# ISBE DID CLI (OFFLINE)

CLI oficial **offline** para generar credenciales necesarias para el alta de una identidad `did:isbe` **sin conectarse a API ni a un nodo**.

> El usuario mantiene siempre su **clave privada localmente**.  
> La CLI genera DID, Clave pública y Prueba criptográfica de forma determinística y reproducible.  
> No realiza transacciones on-chain ni requiere RPC.

---

## 1. Identificación del Artefacto

| Campo                | Valor |
| -------------------- | ----- |
| Nombre del artefacto | ISBE DID CLI (OFFLINE) |
| Origen               | Desarrollo oficial de ISBE sobre el método `did:isbe` |
| Estado               | Activo |
| Versión documento    | 1.0.0 |
| Repositorio          | GitHub: https://github.com/alastria/isbe-identity-did-cli |

---

## 2. Propósito

### Objetivo funcional

Permitir que un usuario genere localmente (offline) la información requerida para registrar/activar un DID en el ecosistema ISBE:

- `DID`
- `Clave pública (formato hexadecimal uncompressed)`
- `Prueba criptográfica`

### Beneficios

- Mayor seguridad: el usuario **no ingresa la private key en portales externos**
- Salida compatible con flujos legacy (incluye `proofHex` con `r+s+methodSpecificId+v`)
- Uso simple y reproducible vía `npx`
- Incluye modo debug y modo JSON para auditoría e integración`

---

## 3. Alcance

### Incluye

- Generación offline de DID `did:isbe`
- Public Key en formato hexadecimal uncompressed
- Prueba criptográfica en formato legacy hex
- Namespace configurable (por defecto uc)
- Fechas notBefore / notAfter
- Modo simple, debug y JSON

### No incluye

- Interacción con smart contracts
- RPC / nodos / transacciones
- Resolución de DID Documents on-chain

---

## 4. Requisitos

- Node.js >= 18
- npm >= 9

---

## 5. Instalación / Uso

```
npm install
npx tsx src/index.ts <command>

```

## 6. Comando principal: generate

Genera **DID + PublicKey** + Proof en modo **offline**.

### Uso básico (recomendado)

Curva **1** por defecto (**secp256k1**), tipo **child** por defecto:
```
npx tsx src/index.ts generate --privKey 0x<PRIVATE_KEY>
```

### Salida (por defecto)

Al ejecutar el comando `generate` sin flags adicionales, la CLI imprime:

- **DID**
- **Clave pública (hex)**
- **Prueba criptográfica**

> **Nota:** la private key **no se imprime** ni se **guarda**.

---

## 7. Opciones disponibles

| Opción | Descripción | Default |
|------|-------------|---------|
| `--privKey <hex>` | Private key (32 bytes hex) | requerido |
| `--curve <num>` | `1=secp256k1`, `2=P-256` | `1` |
| `--modelDeployId <id>` | Namespace para `child` | `uc` |
| `--baseDocument <json>` | Base document JSON (string) | `{}` |
| `--alsoKnownAs <list>` | CSV, ej: `"did:ex:1,did:ex:2"` | vacío |
| `--durationDays <n>` | duración (días) para `notAfter` | `365` |
| `--debug` | imprime `simple` / `json`  | `simple` |

---

## 8. Ejemplos

### 8.1 Curva 1 (default)

```bash
npx tsx src/index.ts generate --privKey 0x<PRIVATE_KEY>
```

### 8.1 debug (auditoría / soporte)
```bash
npx tsx src/index.ts generate --privKey 0x<PRIVATE_KEY> --mode debug
```
### Incluye además:
- namespace
- methodSpecificId
- vMethodId
- ellipticType
- notBefore / notAfter
- hashToSign
- proofRsv
- Payload sugerido para backend
- Output completo en JSON

### json (automatización / integración)
```bash
npx tsx src/index.ts generate --privKey 0x<PRIVATE_KEY> --mode json
```
Imprime solo JSON, sin texto adicional.

## 9. Formatos de salida
### 9.1 DID

Formato:

did:isbe:<namespace>:<methodSpecificId>

### 9.2 Clave pública (hex)

Se entrega con:
- Formato uncompressed
- Prefijo 0x04
- Longitud: 65 bytes

### 9.3 Proof (legacy hex)

**Formato legacy:**

- 0x + r(32) + s(32) + methodSpecificId + v(1)

## 10. Seguridad

La private key:
- No se imprime
- No se persiste
- Solo se usa en memoria para derivar DID y proof

## 11. Licencia

**Apache 2.0**
**© 2025 Comunidad de Madrid & Alastria**-
