
*artifact*:
  id: ISBE-ART-CLI-00001
  name: "ISBE DID Registry CLI"
  type: "Command Line Interface"
  version: "1.0.0"
  status: "Validado"
  date: "2025-11-26"
  repository: "https://github.com/alastria/isbe-identity-did-cli"
  description: >
    CLI oficial para gestionar identidades del método did:isbe directamente 
    contra el smart contract ISBE DID Registry. Permite crear, administrar y 
    consultar identidades, verification methods, controllers, alias y relationships
    de forma on-chain y off-chain.

*sections:*

  identification:
    nombre: "ISBE DID Registry CLI"
    origen: "Desarrollo oficial de ISBE sobre el método did:isbe"
    estado: "Validado"
    versión_documento: "1.0.0"
    fecha: "2025-11-26"
    repositorio: "https://github.com/alastria/isbe-identity-did-cli"

 

  *propósito:*
    objetivo_funcional: >
      Proporcionar una herramienta CLI para interacción directa con los 
      contratos inteligentes del ISBE DID Registry, permitiendo operaciones 
      completas de administración de identidades did:isbe.
    *beneficios:*
      - Interoperabilidad con todo el ecosistema DID.
      - Gestión integral de identidades: creación, rotación, expiración, relaciones.
      - Uso por wallets, integradores, desarrolladores y scripts automatizados.
      - Abstracción de la complejidad de los smart contracts.
    *stakeholders:*
      - Squads de desarrollo ISBE
      - Integradores de sistemas
      - Wallets y proveedores de identidad
      - Organismos reguladores
      - Desarrolladores backend y devops

 

  *alcance_y_ciclo_de_vida:*
    fases:
      definición: "Completada"
      desarrollo: "Completada: comandos, librerías, pruebas"
      mantenimiento: "Activa y planificada"
    dependencias:
      - "ISBE DID Registry Smart Contract"
      - "ethers.js v6"
      - "did-isbe-registry-dev"
    alcance:
      incluye:
        - creación de DIDs root y secundarios
        - administración completa de verification methods
        - controllers
        - relationships
        - alias on/off chain
        - consulta on-chain y local
      excluye:
        - resolución REST (cubierto por did-isbe-resolver)
        - UI o dashboard gráfico

 

  *arquitectura:*
    visión_general: >
      La CLI está construida en Node.js + TypeScript, utilizando ethers.js para 
      comunicarse con el contrato. Cada comando llama a métodos de alto nivel 
      proporcionados por did-isbe-registry-dev.
    componentes:
      cli:
        - index.ts
        - uso de commander.js
      comandos:
        - document.ts
        - controller.ts
        - verification.ts
        - relationships.ts
      utilidades:
        - localStorage.ts
        - didParser.ts
        - helpers
      archivos_locales:
        - .did_root
        - .dids.json

 

  *instalación:*
    requisitos:
      node: ">= 18"
      npm: ">= 9"
      rpc: "Compatible EVM"
      env_file:
        RPC_URL: "http://127.0.0.1:8545"
        ACCOUNT_PRIVATE_KEY: "<clave>"
        DID_REGISTRY_ADDRESS: "<contrato>"
    pasos:
      - "npm install"
      - "npx tsx src/index.ts <command>"

 

  *comandos:* 

    init:
      descripción: "Inicializa el contrato si no ha sido inicializado. Crea un Root DID."
      ejemplo: "npx tsx src/index.ts init 1"

 

    create_root:
      descripción: "Crea un DID Root"
      ejemplo: >
        npx tsx src/index.ts create-root <PRIVKEY> '{}' --aka "Mi DID Root"

 

    create_secondary:
      descripción: "Crea un DID secundario controlado por un Root DID"
      ejemplo: >
        npx tsx src/index.ts createSecondary <ROOT_PRIV_KEY> '{"id":"","publicKey":[]}'

 

    get_did:
      descripción: "Consulta un DID y muestra documento on-chain y local"
      ejemplo: >
        npx tsx src/index.ts get-did --did "did:isbe:network:00abc123"

 

    get_did_by_timestamp:
      descripción: "Consulta el DID document en un instante del tiempo"
      ejemplo: >
        npx tsx src/index.ts get-did-by-timestamp --did <did> --timestamp 1735600000

 

    ###Verification Methods

 

    add_vm:
      descripción: "Añade un Verification Method"
      ejemplo: >
        npx tsx src/index.ts add-vm --did <did> --pub <pubKey> --curve 1

 

    revoke_vm:
      descripción: "Revoca un VM"
      ejemplo: >
        npx tsx src/index.ts revoke-vm --did <did> --vm <fragment>

 

    expire_vm:
      descripción: "Expira un VM"
      ejemplo: >
        npx tsx src/index.ts expire-vm --did <did> --vm <fragment> --notAfter <timestamp>

 

    roll_vm:
      descripción: "Rota un VM generando un nuevo fragment"
      ejemplo: >
        npx tsx src/index.ts roll-vm --did <did> --old <fragment> --pub <newPub> --curve 1

 

    ### Verification Relationships

 

    add_verification_rel:
      descripción: "Asocia un VM a una relación (authentication, assertionMethod...)"
      ejemplo: >
        npx tsx src/index.ts add-verification-rel \
          --did <did> \
          --name authentication \
          --vm "<did#fragment>" \
          --notBefore 1735600000 \
          --notAfter 1767136000

 

    list_dids_by_relationship:
      descripción: "Obtiene todos los DIDs vinculados a un VM mediante una relación"
      ejemplo: >
        npx tsx src/index.ts list-dids-by-verification-rel \
          --vm <did#fragment> \
          --name authentication \
          --page 1 --pageSize 10

    ### Controllers

    add_controller:
      descripción: "Añade un controller a un DID"
      ejemplo: >
        npx tsx src/index.ts add-controller --did <did> --controller <controllerDid>

 

    remove_controller:
      descripción: "Quita controller"
      ejemplo: "npx tsx src/index.ts remove-controller --did <did>"


    ### Alias

    update_alias:
      descripción: "Actualiza alias local"
      ejemplo: "npx tsx src/index.ts update-alias --did <did> --aka 'Nuevo alias'"

 

    update_alias_onchain:
      descripción: "Actualiza alias on-chain"
      ejemplo: >
        npx tsx src/index.ts update-alias-onchain --did <did> --alsoKnownAs "public-alias"

 

    ###Listado local

 

    list:
      descripción: "Lista los DIDs almacenados localmente"
      ejemplo: "npx tsx src/index.ts list"

 

  *almacenamiento_local:*
    archivos:
      did_root: "Llave privada del Root DID"
      dids_json: "DIDs creados, alias, timestamps"
    estructura:
      did_entry:
        did: "did:isbe:..."
        type: "root | child"
        owner: "publicKey"
        alsoKnownAs: "string"
        createdAt: "timestamp"
        updatedAt: "timestamp"

 

  *calidad:*
    pruebas:
      framework: "Jest"
      cobertura:
        - validación de DIDs
        - creación de VMs
        - controllers
        - relationships
        - almacenamiento local
        - integración con contratos
    buenas_prácticas:
      - validación estricta
      - manejo de errores ethers.js
      - tipado fuerte TypeScript
      - modularidad por comando

 

  *reglas_de_negocio:*
    vm:
      revoked_no_eliminar: "Los VM revocados se mantienen si tienen relaciones vigentes"
      relación_tiempo: >
        Las relaciones dependen de notBefore / notAfter. Si se consulta un timestamp donde la
        relación era válida, se mostrará aunque se haya modificado después.
    controllers:
      root_requerido: "Un Root DID controla sus hijos de manera predeterminada"

 

  *dependencias:*
    node: ">=18"
    librerías:
      - ethers.js 6.x
      - did-isbe-registry-dev
      - commander.js
      - dotenv
      - tsx
      - typescript

 

  *limitaciones:*
    - método exclusivo did:isbe
    - requiere disponibilidad del RPC
    - requiere contrato desplegado
    - no resuelve documentos vía API REST (solo on-chain)

 

  *control_de_versiones:*
    esquema: "SemVer"
    cambios:
      menor:
        aprobación: "Pull request + revisión técnica"
        documentación: "Release notes"
      mayor:
        aprobación: "Comité técnico ISBE"
        documentación: "Informe de impacto"
      hotfix:
        aprobación: "Urgente"
        documentación: "Pruebas adjuntas"


  *licencia:*
    tipo: "Apache 2.0"
    copyright:
      owner: "Comunidad de Madrid & Alastria"
      year: 2025
