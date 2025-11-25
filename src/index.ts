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


import fs from "fs";

import { selfSign, buildDID, fragmentFromDid, pubkeyToJWK } from "./utils/didUtils";
 
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
  .command("get-did")
  .requiredOption("--did <did>", "DID a consultar")
  .action(async (opts) => {
    try {
      const did = opts.did;
      const entry = findDID(did);
      if (!entry) {
        console.log(chalk.yellow(`DID ${did} no encontrado en storage local (.dids.json)`));
        return;
      }
      console.log(chalk.blueBright(" DID (off-chain):"));
      console.log(JSON.stringify(entry, null, 2));
    } catch (e: any) {
      console.error(chalk.red("Error consultando DID:"), e.message || e);
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
 

program
  .command("add-vmethod")
  .requiredOption("--did <did>", "DID al que añadir vMethod")
  .requiredOption("--pub <pubHex>", "Public key hex (0x04||X||Y) o JWK JSON string")
  .option("--name <name>", "Nombre del vMethod")
  .option("--notBefore <ts>", "notBefore (unix seconds)")
  .option("--notAfter <ts>", "notAfter (unix seconds)")
  .action(async (opts) => {
    try {
      const nb = opts.notBefore ? Number(opts.notBefore) : undefined;
      const na = opts.notAfter ? Number(opts.notAfter) : undefined;
      await didCLI.addVerificationMethod(opts.did, opts.pub, opts.name, nb, na);
      console.log(chalk.green("add-vmethod finalizado."));
    } catch (e: any) {
      console.error(chalk.red("Error en add-vmethod:"), e.message || e);
    }
  });
 
program
  .command("revoke-vmethod")
  .requiredOption("--did <did>", "DID")
  .requiredOption("--fragment <frag>", "fragment (base58) del vMethod")
  .action(async (opts) => {
    try {
      await didCLI.revokeVerificationMethod(opts.did, opts.fragment);
      console.log(chalk.green("revoke-vmethod finalizado."));
    } catch (e: any) {
      console.error(chalk.red("Error en revoke-vmethod:"), e.message || e);
    }
  });
program.parse();

 