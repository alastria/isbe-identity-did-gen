/**  
* Copyright (c) 2025 Comunidad de Madrid & Alastria  
*  
* Licensed under the Apache License, Version 2.0 (the "License");  
* you may not use this file except in compliance with the License.  
*  
* You may obtain a copy of the License at  
* [http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0 "http://www.apache.org/licenses/license-2.0")  
*  
* Unless required by applicable law or agreed to in writing, software  
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  
* See the License for the specific language governing permissions and  
* limitations under the License.  
*/
import dotenv from "dotenv";
dotenv.config();
import { Command } from "commander";
import chalk from "chalk";
import { JsonRpcProvider, Wallet } from "ethers";
import DidCommands from "./commands/document";
import DidRelationship from "./commands/relationship"
import { isRegistryInitialized } from "./utils/isRegistryInitialized";
import { loadRootWallet } from "./utils/loadRootWallet";
import { readDIDs, findDID } from "./utils/localStorage";
import DidControllerCLI from "./commands/controller";
import VerificationCLI from "./commands/verification";
import fs from "fs";

 
const RPC_URL = process.env.RPC_URL!;
const PRIVATE_KEY = process.env.ACCOUNT_PRIVATE_KEY!;
const DID_REGISTRY_ADDRESS = process.env.DID_REGISTRY_ADDRESS!;
 
if (!RPC_URL || !PRIVATE_KEY || !DID_REGISTRY_ADDRESS) throw new Error("Faltan variables en .env");
const normalizedPrivateKey = PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : "0x" + PRIVATE_KEY;
const provider = new JsonRpcProvider(RPC_URL);
const signer = new Wallet(normalizedPrivateKey, provider);
const cmd = process.argv[2];
 
let signerToUse = signer;

if (cmd !== "init" && cmd !== "create-root") {
  signerToUse = loadRootWallet(provider);
  console.log(" Usando ROOT WALLET desde .did_root:", signerToUse.address);
}
 
const didCLI = new DidCommands(provider, signerToUse, RPC_URL);
const program = new Command();
 
program
  .command("init")
  .argument("<ellipticType>", "Tipo de curva elíptica")
  .action(async (ellipticType) => {
    const alreadyInitialized = await isRegistryInitialized(provider, DID_REGISTRY_ADDRESS);
    if (alreadyInitialized) return console.log("El registro ya fue inicializado.");
    await didCLI.init(Number(ellipticType));
  });
 
program
  .command("create-root")
  .argument("<privKey>", "Private key para generar el primer DID")
  .argument("[baseDocumentPos]", "Documento base del DID (opcional, si no se usa --baseDocument)")
  .option("--baseDocument <json>", "Documento base (si contiene caracteres especiales, pásalo con --baseDocument '<json>')")
  .option("--aka <alsoKnownAs>", "Alias")
  .description("Crea el Root DID")
  .action(async (privKey: string, baseDocumentPos: string | undefined, opts: any) => {
    try {
      const baseDocument = opts.baseDocument ?? baseDocumentPos ?? "{}";
      try {
        JSON.parse(baseDocument);
      } catch (e) {
        console.error(chalk.red("El baseDocument no es un JSON válido. Pásalo entre comillas o usa --baseDocument '<json>'"));
        return;
      }
      const normalized = privKey.startsWith("0x") ? privKey : "0x" + privKey;
      const did = await didCLI.createRoot(normalized, baseDocument, opts.aka);
      console.log(chalk.green(`Root DID creado correctamente: ${did}`));

        fs.writeFileSync(
          ".did_root",
          `PRIVATE_KEY=${normalized}\nDID=${did}\n`,
          "utf8"
        );
        
        console.log(chalk.green("Archivo .did_root creado correctamente."));
    } catch (err: any) {
      console.error(chalk.red("Error al crear Root DID:"), err.message || err);
    }
  });

program
  .command("createSecondary <privKey> <baseDocument>")
  .description("Crea un DID secundario (child DID)")
  .option("--aka <aka>", "Alias opcional (alsoKnownAs)")
  .action(async (privKey: string, baseDocument: string, options: any) => {
    try {
      const normalized = privKey.startsWith("0x") ? privKey : "0x" + privKey;
      try {
        JSON.parse(baseDocument);
      } catch (e) {
        console.error(chalk.red("El baseDocument no es un JSON válido. Pásalo entre comillas."));
        return;
      }
      const did = await didCLI.createChild(normalized, baseDocument, options.aka);
      console.log(chalk.green("DID secundario creado:"), did);
    } catch (err: any) {
      console.error(chalk.red("Error en createSecondary:"), err.message || err);
    }
  });
 
program
  .command("update-base")
  .requiredOption("--did <string>", "DID a actualizar")
  .requiredOption("--baseDocument <json>", "Nuevo baseDocument en JSON")
  .action(async (opts) => {
    try {
      const baseDocument = JSON.parse(opts.baseDocument);
      await didCLI.updateBaseDocument(opts.did, baseDocument);
    } catch (err) {
      console.error("Error en update-base:", err);
    }
  });
  

program
  .command("update-alias")
  .requiredOption("--did <did>", "DID a actualizar")
  .requiredOption("--alsoKnownAs <aka>", "Nuevo alias")
  .action(async (opts) => {
    try {
      await didCLI.updateAlsoKnownAs(opts.did, opts.alsoKnownAs);
      console.log(chalk.green("update-alias finalizado."));
    } catch (e: any) {
      console.error(chalk.red("Error en update-alias:"), e.message || e);
    }
  });
 
program
  .command("list")
  .description("Lista los DIDs almacenados por la CLI (off-chain)")
  .action(async () => {
    try {
      const data = readDIDs(); 
      if (!Array.isArray(data) || data.length === 0) {
        console.log(chalk.yellow("No hay DIDs guardados en .dids.json"));
        return;
      }
      const table = data.map(d => ({
        did: d.did,
        type: d.type,
        aka: d.alsoKnownAs ?? d.aka ?? "",
        createdAt: new Date(d.createdAt).toISOString()
      }));
      console.table(table);
    } catch (e: any) {
      console.error(chalk.red("Error leyendo storage local:"), e.message || e);
    }
  });

program
  .command("list-onchain")
  .description("Lista los DIDs almacenados en la blockchain con paginación")
  .option("--page <num>", "Página", "1")
  .option("--pageSize <num>", "Tamaño de página", "10")
  .action(async (opts) => {
    try {
      const page = Number(opts.page);
      const size = Number(opts.pageSize);
  
      const result = await didCLI.listOnChainDIDs(page, size);
      console.log(chalk.blue("\nResultado on-chain:\n"));
      console.log(JSON.stringify(result, null, 2));
    } catch (err: any) {
      console.error(chalk.red("Error en list-onchain:"), err.message || err);
    }
  });
 
program
  .command("get-did")
  .requiredOption("--did <did>", "DID a consultar")
  .action(async (opts) => {
    try {
      const onchain = await didCLI.getDidOnChain(opts.did);
      if (!onchain) return;
      const local = findDID(opts.did);
      console.log(chalk.blueBright("\nInformación combinada (on-chain + off-chain):\n"));
       console.log(JSON.stringify({
        onchain,
        local
      }, null, 2));
    } catch (e: any) {
      console.error(chalk.red("Error en get-did:"), e.message || e);
    }
  });
program
  .command("get-did-by-timestamp-onchain")
  .requiredOption("--did <did>", "DID a consultar")
  .requiredOption("--timestamp <ts>", "Timestamp en segundos")
  .option("--format <hex|jwk>", "Formato del resultado", "hex")
  .description("Consulta un DID histórico directamente en blockchain")
  .action(async (opts) => {
    try {
      await didCLI.getDidByTimestampOnChain(
        opts.did,
        Number(opts.timestamp),
        opts.format
      );
    } catch (e: any) {
      console.error(chalk.red("Error en get-did-by-timestamp-onchain:"), e.message || e);
    }
});

program
  .command("get-did-by-timestamp")
  .requiredOption("--did <did>", "DID a consultar")
  .requiredOption("--timestamp <ts>", "Timestamp en segundos")
  .option("--format <hex|jwk>", "Formato", "hex")
  .action(async (opts) => {
    await didCLI.getDidByTimestamp(opts.did, Number(opts.timestamp), opts.format);
  });
 
function initEnvironment() {
  const relationship = new DidRelationship(provider, signerToUse, RPC_URL);
  const controller = new DidControllerCLI(provider, signerToUse, RPC_URL);
  const verification = new VerificationCLI(provider, signerToUse);
  return { relationship, controller, verification };
}
 
program
  .command("add-vm")
  .requiredOption("--did <did>", "DID")
  .requiredOption("--pub <key>", "Public key hex")
  .option("--curve <num>", "EllipticType", "1")
  .description("Añade un verificationMethod")
  .action(async (opts) => {
    const { relationship } = initEnvironment();
    await relationship.addVerificationMethod(
      opts.did,
      opts.pub,
      Number(opts.curve)
    );
  });

program
  .command("revoke-vm")
  .requiredOption("--did <did>", "DID")
  .requiredOption("--fragment <frag>", "Fragment del VM")
  .option("--notAfter <num>", "Timestamp de revocación")
  .description("Revoca un verificationMethod")
  .action(async (opts) => {
    const { relationship } = initEnvironment();
    await relationship.revokeVerificationMethod(
      opts.did,
      opts.fragment,
      opts.notAfter ? Number(opts.notAfter) : undefined
    );
 });
 

program
  .command("expire-vm")
  .requiredOption("--did <did>", "DID")
  .requiredOption("--fragment <frag>", "Fragment del VM")
  .requiredOption("--notAfter <num>", "Nuevo timestamp notAfter")
  .description("Expira un verificationMethod")
  .action(async (opts) => {
    const { relationship } = initEnvironment();
    await relationship.expireVerificationMethod(
      opts.did,
      opts.fragment,
      Number(opts.notAfter)
    );
  });

 

program
  .command("roll-vm")
  .requiredOption("--did <did>", "DID")
  .requiredOption("--old <frag>", "Fragment viejo")
  .requiredOption("--pub <key>", "Nueva public key")
  .option("--curve <num>", "EllipticType", "1")
  .option("--duration <num>", "Duración de validez (segundos)", "31536000")
  .description("Rota (roll) un verificationMethod")
  .action(async (opts) => {
    const { relationship } = initEnvironment();
    await relationship.rollVerificationMethod(
      opts.did,
      opts.old,
      opts.pub,
      Number(opts.curve),
      Number(opts.duration)
    );
  });

 
program
  .command("add-controller")
  .requiredOption("--did <did>", "DID al que se añadirá el controller")
  .requiredOption(
    "--controller <controllerDid>",
    "DID del controller (ej: did:isbe:root:...)"
  )
  .action(async (opts) => {
    const { controller } = initEnvironment();
    await controller.addController(opts.did, opts.controller);
  });
 
program
  .command("revoke-controller")
  .requiredOption("--did <did>", "DID objetivo")
  .requiredOption(
    "--controller <controllerDid>",
    "DID del controller a revocar"
  )
  .action(async (opts) => {
    const { controller } = initEnvironment();
    await controller.revokeController(opts.did, opts.controller);
  });
 
program
  .command("check-controller")
  .requiredOption("--did <did>", "DID objetivo")
  .requiredOption(
    "--controller <address>",
    "Address Ethereum del controller (0x...)"
  )
  .action(async (opts) => {
    const { controller } = initEnvironment();
    await controller.check(opts.did, opts.controller);
  });
 
program
  .command("list-dids-by-controller")
  .requiredOption(
    "--controller <controllerDid>",
    "DID del controller (ej: did:isbe:root:...)"
  )
  .option("--page <n>", "Página", "0")
  .option("--pageSize <n>", "Tamaño de página", "10")
  .action(async (opts) => {
    const { controller } = initEnvironment();
    await controller.listByController(
      opts.controller,
      Number(opts.page),
      Number(opts.pageSize)
    );
  });

  program
  .command("add-verification-rel")
  .requiredOption("--did <did>", "DID objetivo")
  .requiredOption("--name <string>", "Nombre de la relación (authentication, assertionMethod, etc.)")
  .requiredOption("--vm <vMethodId>", "Verification Method ID")
  .option("--notBefore <num>", "Timestamp notBefore", "")
  .option("--notAfter <num>", "Timestamp notAfter", "")
  .action(async (opts) => {
    const { did, name, vm } = opts;
    const nb = opts.notBefore ? Number(opts.notBefore) : undefined;
    const na = opts.notAfter ? Number(opts.notAfter) : undefined;
    const { verification } = initEnvironment();
    await verification.addRelationship(did, name, vm, nb, na);
  });
 
program
  .command("list-dids-by-verification-rel")
  .requiredOption("--vm <vMethodId>", "Verification Method ID")
  .requiredOption("--name <string>", "Nombre del verification relationship")
  .option("--page <num>", "Página", "1")
  .option("--pageSize <num>", "Tamaño de página", "10")
  .action(async (opts) => {
    const page = Number(opts.page);
    const pageSize = Number(opts.pageSize);
    const { verification } = initEnvironment();
    await verification.listDidsByRelationship(
      opts.vm,
      opts.name,
      page,
      pageSize
    );
  }); 

program.parse();

 