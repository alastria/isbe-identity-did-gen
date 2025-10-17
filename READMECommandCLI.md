# DID Registry CLI
 
Herramienta de línea de comandos para gestionar Identificadores Descentralizados (DIDs), controladores, métodos de verificación y relaciones dentro del registro DID de ISBE.
 
## Descripción del Proyecto
 
Este CLI permite interactuar con el contrato de registro de DIDs desplegado en Ethereum, facilitando la creación y gestión de identidades descentralizadas.
 
## Arquitectura

- index.ts: punto de entrada  
- controller: operaciones sobre controladores  
- document: gestión de documentos DID  
- verification: gestión de métodos de verificación  
- relationship: gestión de relaciones
 
## Requisitos
 
- Node.js v18+
- pnpm / npm / yarn
- Acceso a un nodo Ethereum compatible (RPC)
- Claves privadas para firmar transacciones
 
## Instalación Rápida
    git clone https://github.com/alastria/isbe-identity/tree/evolutivo-epica-76
    cd \isbe-identity\artefactos\apps\did-registry-cli
    pnpm install
 
## Configuración
 
Este proyecto utiliza archivos `.env` para la configuración:
1. `.env`: usado para despliegue (wallet creadora del DID).
2. `.env.controller`: usado como controller (identity que firma en controller, verification, relationship).
 
Ejemplo `.env`:
    ACCOUNT_ADDRESS=<dirección de env>
    ACCOUNT_PRIVATE_KEY=<llave privada env>
    RPC_URL=http://34.175.89.69:8545
Ejemplo `.env.controller`:
    ACCOUNT_ADDRESS="<dirección controller generado>"
    ACCOUNT_PRIVATE_KEY="<llave del controler generado>"
 
    Ejecución con archivo específico:
        npx tsx src/index.ts --env .env.controller controller add ...
 
## Uso
    npx tsx src/index.ts <grupo> <subcomando> [opciones]
 
Grupos:
- controller
- document
- verification
- relationship
 
## Comandos Disponibles
 
    ### Controller
        npx tsx src/index.ts controller add --did <did> --controllerDid <controllerDid>
        npx tsx src/index.ts controller revoke --did <did> --controllerDid <controllerDid>
        npx tsx src/index.ts controller check --did <did> --controllerAddr <address>
    
### Document
 
    npx tsx src/index.ts document init
    npx tsx src/index.ts document create-stable --modelDeployId <id> --vMethodId <key> --ellipticType 1 --validityDays 365
    npx tsx src/index.ts document get --did <did>
    npx tsx src/index.ts document getByTimestamp --did <did> --timestamp <unix>
    npx tsx src/index.ts document list --page 1 --pageSize 10
    npx tsx src/index.ts document update --did <did> --newDoc '<json>'
 
### Verification
    npx tsx src/index.ts verification add --did <did> --vMethodId <id> --publicKey <hex> --ellipticType 1
    npx tsx src/index.ts verification expire --did <did> --vMethodId <id> --notAfter <unix>
    npx tsx src/index.ts verification revoke --did <did> --vMethodId <id> --notAfter <unix>
    npx tsx src/index.ts verification roll --did <did> --oldVMethodId <old> --vMethodId <new> --publicKey <hex> --ellipticType 1 --notBefore <unix> --notAfter <unix> --duration <days>
 
### Relationship
    npx tsx src/index.ts relationship add --did <did> --name <relacion> --vMethodId <id> --notBefore <unix> --notAfter <unix>
    npx tsx src/index.ts relationship list --vMethodId <id> --name <relacion> --page 1 --pageSize 10
 
## Ejemplos de Uso Completo
 
### Flujo típico
 
1. Crear un DID estable con `.env` de despliegue.
2. Agregar un controller con `.env.controller`.
3. Añadir un verification method.
4. Asignar una relación.
 
## Formato de Parámetros
- vMethodId: identificador único del método de verificación.
- ellipticType: curva elíptica usada (ej: 1 para secp256k1).
- notBefore / notAfter: timestamps Unix en segundos.
- duration: número de días de validez.

## Notas de Seguridad 
- No subir archivos `.env` al repositorio.
- Usar wallets diferentes para pruebas y producción.
- Proteger claves privadas con permisos de archivo.
 
 
## FAQ / Problemas Comunes
 
- Error de conexión RPC → revisar RPC_URL en `.env`.
- UnauthorizedController → usar `.env.controller`.
- Invalid timestamp → usar Unix time en segundos.
- Controller no authorized -> Validar uso de datos de controller en env.controller
 
## Paso a paso:

1. Inserte un nuevo did con el comando: 
npx tsx src/index.ts document create-stable --modelDeployId deploy-001 --vMethodId key-001 --ellipticType 1 --validityDays 365

Tener en cuenta la información que indica el sistema:

Private key generada (hex): <información de llave privada DID generado>
Address derivada: <address generado de DID privado>
DID generado: did:isbe:deploy-001:<DID generado>
PublicKeyHex (uncompressed): <Llave privada sin comprimir>


2. Valide los DIDs generados y seleccione el DID al cual desea asignarle el controller que ha registrado anteriormente

npx tsx src/index.ts document list --page 1 --pageSize 60

3. Asígnele controller a ese DID seleccionado:

npx tsx src/index.ts controller add --did 'did:isbe:<DID seleccionado para tener controller>' --controllerDid 'did:isbe:deploy-001:<DID generado en el paso uno>'

4. Ingrese los datos del paso Uno en el documento .env.controller:
ACCOUNT_ADDRESS="<dirección controller generado>"
ACCOUNT_PRIVATE_KEY="<llave del controler generado>"

5. Valide que el DID seleccionado ya cuente con los permisos con el comando:
npx tsx src/index.ts controller check --did 'did:isbe:bare-deploy-01:<DID al cual se le asignó un controller' --controllerAddr 'address del controller con la información del punto Uno'

6. Uso de los métodos por tipo:
	controller: add, revoke, check: Añadir, revocar y validar el controller
	
	npx tsx src/index.ts controller add --did <did> --controllerDid <controllerDid>
	-> Añade controller al DID deseado
        npx tsx src/index.ts controller revoke --did <did> --controllerDid <controllerDid>
	-> Revoca el controller generado al DID deseado
        npx tsx src/index.ts controller check --did <did> --controllerAddr <address>
	-> Valida el controller al DID deseado
	-> Si no se le ingresa address revierte con error personalizado


	Document: document, create-stable, get, getByTimestamp, list, update: Desplegar, crear DID, 
	//Novedad: para poder conocer el DID Document en formato JWK colocar --format jwk
	
	npx tsx src/index.ts document init 
	-> Si ya se inicializó indica "initializeDiDRegistry ya fue llamado anteriormente"
    
    	npx tsx src/index.ts document create-stable --modelDeployId <id> --vMethodId <key> --ellipticType 1 --validityDays 365
	-> Indica la información del DID generado 

    	npx tsx src/index.ts document get --did <did>
		npx tsx src/index.ts document get --did <did> --omitContext
		npx tsx src/index.ts document get --did <did> --format jwk
	-> Indica la información del documento del DID seleccionado
	-> Si no se selecciona formato, por defecto indicará hex
	-> Si se desea no mostrar el context, se debe colocar --omitContext

    	npx tsx src/index.ts document getByTimestamp --did <did> --timestamp <unix>
		npx tsx src/index.ts document getByTimestamp --did <did> --timestamp <unix> --format jwk
	-> Devuelve la información del DID registrada en esa fecha en específico
	-> Si DID no registrado en la fecha, devuelve información vacía
	-> Si no se selecciona formato, por defecto indicará hex

    	npx tsx src/index.ts document list --page 1 --pageSize 10
	-> Devuelve todos los números de DIDs registrados por páginas y candidad de DIDs por página

    	npx tsx src/index.ts document update --did <did> --newDoc '<json>'
	-> Modifica información de documento DID
	-> Valida que el JSON contenga el formato real o revierte con error personalizado

	
	verification: add, expire, revoke, roll: añade, expira, revoca y rotar un método de verificación

	IMPORTANTE: Para poder generar los métodos es importante usar el Dev.controller

	npx tsx src/index.ts verification add --did <DID con controller> --vMethodId <Método a agregar> --publicKey <llave píblica del DID controller> --ellipticType 1 --env .env.controller
	-> Si se registra uno o más datos erróneos revierte con unknown custom error
	-> Si es efectivo indicará addVerificationMethod tx
	-> No es posible usar la misma llave para dos transacciones
	-> Did con un anterior método registrado y eliminado revierte si se desea volver a asignar

	npx tsx src/index.ts verification expire --did <DID con controller> --vMethodId <Método a modificar> --notAfter <Fecha en unix>
	-> En env de despliegue puede usar el método
	-> Si se registra uno o más datos erróneos revierte con unknown custom error

	npx tsx src/index.ts verification revoke --did <DID con controller> --vMethodId <Método a revocar> --notAfter <Fecha en unix>
	-> Si la fecha es superior, se revierte sin mensaje
	-> Si es efectivo indicará revokeVerificationMethod tx:

	Rotar (rollover) verification method
	npx tsx src/index.ts verification roll --did <DID con controller> --oldVMethodId <antiguo método> --vMethodId <nuevo Método> --publicKey <Public key controller> --ellipticType 1 --notBefore <Fecha en unix> --notAfter <Fecha en unix> --duration 3600 --env .env.controller
	-> Es encesario que sea el controller quien lo genere
	-> si es efectivo indicará rollVerificationMethod tx: 

	npx tsx src/index.ts relationship add --did <DID con controller> --name authentication --vMethodId <Método de DID> --notBefore <Fecha en unix> --notAfter <Fecha en unix>
	-> pendiente por transacciones send

	npx tsx src/index.ts relationship list --vMethodId key-001 --name authentication --page 1 --pageSize 10
	-> Debe realizarse con la cuenta signer

 
## Changelog
 
V1.0

Copyright © 2025 Comunidad de Madrid & Alastria

 