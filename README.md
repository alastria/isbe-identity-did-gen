# ISBE DID Registry CLI

CLI oficial para gestionar identidades del método `did:isbe` directamente contra el smart contract ISBE DID Registry. Permite crear, administrar y consultar identidades, verification methods, controllers, alias y relationships de forma on-chain y off-chain.

---

## 1. Identificación del Artefacto

| Campo                | Valor                                                       |
| -------------------- | ----------------------------------------------------------- |
| Nombre del artefacto | ISBE DID Registry CLI                                       |
| Origen               | Desarrollo oficial de ISBE sobre el método did:isbe         |
| Estado               | Validado                                                    |
| Versión documento    | 1.0.0                                                       |
| Fecha                | 2025-11-26                                                  |
| Repositorio          | [GitHub](https://github.com/alastria/isbe-identity-did-cli) |

---

## 2. Propósito del Artefacto

### Objetivo funcional

Proporcionar una herramienta CLI para interacción directa con los contratos inteligentes del ISBE DID Registry, permitiendo operaciones completas de administración de identidades `did:isbe`.

### Beneficios

- Interoperabilidad con todo el ecosistema DID.
- Gestión integral de identidades: creación, rotación, expiración, relaciones.
- Uso por wallets, integradores, desarrolladores y scripts automatizados.
- Abstracción de la complejidad de los smart contracts.

### Stakeholders

- Squads de desarrollo ISBE
- Integradores de sistemas
- Wallets y proveedores de identidad
- Organismos reguladores
- Desarrolladores backend y DevOps

---

## 3. Alcance y Ciclo de Vida

### Fases

| Fase                 | Estado                                   |
| -------------------- | ---------------------------------------- |
| Definición funcional | Completado                               |
| Desarrollo           | Completado: comandos, librerías, pruebas |
| Mantenimiento        | Activa y planificada                     |

### Dependencias

- ISBE DID Registry Smart Contract
- ethers.js v6
- did-isbe-registry-dev

### Alcance

**Incluye:**

- Creación de DIDs root y secundarios
- Administración completa de verification methods
- Controllers
- Relationships
- Alias on/off chain
- Consulta on-chain y local

**Excluye:**

- Resolución REST (cubierto por did-isbe-resolver)
- UI o dashboard gráfico

---

## 4. Arquitectura

### Visión General

La CLI está construida en Node.js + TypeScript, utilizando ethers.js para comunicarse con el contrato. Cada comando llama a métodos de alto nivel proporcionados por `did-isbe-registry-dev`.

### Componentes

- **CLI**
  - index.ts
  - uso de commander.js
- **Comandos**
  - document.ts
  - controller.ts
  - verification.ts
  - relationships.ts
- **Utilidades**
  - localStorage.ts
  - didParser.ts
  - helpers
- **Archivos locales**
  - .did_root
  - .dids.json

---

## 5. Instalación

### Requisitos

- Node.js >= 18
- npm >= 9
- RPC compatible EVM
- Archivo `.env` con:
  - `RPC_URL=http://127.0.0.1:8545`
  - `ACCOUNT_PRIVATE_KEY=<clave>`
  - `DID_REGISTRY_ADDRESS=<contrato>`

### Pasos

```bash
npm install
npx tsx src/index.ts <command>
```

## DID Registry CLI - Comandos

### 1. Comandos Principales

#### Inicialización

| Comando              | Descripción                                                          | Ejemplo                                                                           |
| -------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| init                 | Inicializa el contrato si no ha sido inicializado. Crea un Root DID. | `npx tsx src/index.ts init 1`                                                     |
| create-root          | Crea un DID Root                                                     | `npx tsx src/index.ts create-root <PRIVKEY> '{}' --aka "Mi DID Root"`             |
| createSecondary      | Crea un DID secundario controlado por un Root DID                    | `npx tsx src/index.ts createSecondary <ROOT_PRIV_KEY> '{"id":"","publicKey":[]}'` |
| get-did              | Consulta un DID y muestra documento on-chain y local                 | `npx tsx src/index.ts get-did --did "did:isbe:network:00abc123"`                  |
| get-did-by-timestamp | Consulta el DID document en un instante del tiempo                   | `npx tsx src/index.ts get-did-by-timestamp --did <did> --timestamp 1735600000`    |

---

### 2. Verification Methods (VM)

| Comando   | Descripción                            | Ejemplo                                                                              |
| --------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| add-vm    | Añade un Verification Method           | `npx tsx src/index.ts add-vm --did <did> --pub <pubKey> --curve 1`                   |
| revoke-vm | Revoca un VM                           | `npx tsx src/index.ts revoke-vm --did <did> --vm <fragment>`                         |
| expire-vm | Expira un VM                           | `npx tsx src/index.ts expire-vm --did <did> --vm <fragment> --notAfter <timestamp>`  |
| roll-vm   | Rota un VM generando un nuevo fragment | `npx tsx src/index.ts roll-vm --did <did> --old <fragment> --pub <newPub> --curve 1` |

---

### 3. Verification Relationships

| Comando                       | Descripción                                                      | Ejemplo                                                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| add-verification-rel          | Asocia un VM a una relación (authentication, assertionMethod...) | `npx tsx src/index.ts add-verification-rel --did <did> --name authentication --vm "<did#fragment>" --notBefore 1735600000 --notAfter 1767136000` |
| list-dids-by-verification-rel | Obtiene todos los DIDs vinculados a un VM mediante una relación  | `npx tsx src/index.ts list-dids-by-verification-rel --vm <did#fragment> --name authentication --page 1 --pageSize 10`                            |

---

### 4. Controllers

| Comando           | Descripción                  | Ejemplo                                                                        |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| add-controller    | Añade un controller a un DID | `npx tsx src/index.ts add-controller --did <did> --controller <controllerDid>` |
| remove-controller | Quita controller             | `npx tsx src/index.ts remove-controller --did <did>`                           |

---

### 5. Alias

| Comando              | Descripción              | Ejemplo                                                                              |
| -------------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| update-alias         | Actualiza alias local    | `npx tsx src/index.ts update-alias --did <did> --aka 'Nuevo alias'`                  |
| update-alias-onchain | Actualiza alias on-chain | `npx tsx src/index.ts update-alias-onchain --did <did> --alsoKnownAs "public-alias"` |

---

### 6. Listado Local

| Comando | Descripción                           | Ejemplo                     |
| ------- | ------------------------------------- | --------------------------- |
| list    | Lista los DIDs almacenados localmente | `npx tsx src/index.ts list` |

---

### 7. Almacenamiento Local

- **Archivos**
  - `.did_root`: Llave privada del Root DID
  - `.dids.json`: DIDs creados, alias, timestamps
- **Estructura de un DID**
  - `did`: `did:isbe:...`
  - `type`: `root | child`
  - `owner`: `publicKey`
  - `alsoKnownAs`: `string`
  - `createdAt`: `timestamp`
  - `updatedAt`: `timestamp`

---

### 8. Calidad y Pruebas

- **Framework:** Jest
- **Cobertura:**
  - Validación de DIDs
  - Creación de VMs
  - Controllers
  - Relationships
  - Almacenamiento local
  - Integración con contratos
- **Buenas prácticas:**
  - Validación estricta
  - Manejo de errores ethers.js
  - Tipado fuerte TypeScript
  - Modularidad por comando

---

### 9. Reglas de Negocio

- **VM**
  - Los VM revocados se mantienen si tienen relaciones vigentes
  - Relaciones dependen de `notBefore` / `notAfter`
- **Controllers**
  - Un Root DID controla sus hijos de manera predeterminada

---

### 10. Dependencias

- Node.js >=18
- ethers.js 6.x
- did-isbe-registry-dev
- commander.js
- dotenv
- tsx
- typescript

---

### 11. Limitaciones

- Método exclusivo `did:isbe`
- Requiere disponibilidad del RPC
- Requiere contrato desplegado
- No resuelve documentos vía API REST (solo on-chain)

---

### 12. Control de Versiones

- **Esquema:** SemVer
- **Cambios menores:** Pull request + revisión técnica, release notes
- **Cambios mayores:** Comité técnico ISBE, informe de impacto
- **Hotfix:** Aprobación urgente, pruebas adjuntas

---

### 13. Licencia

- **Tipo:** Apache 2.0
- **Copyright:** © 2025 Comunidad de Madrid & Alastria
