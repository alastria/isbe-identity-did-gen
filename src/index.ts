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
* distributed under the License is distributed on an "AS IS" BASIS,  
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  
* See the License for the specific language governing permissions and  
* limitations under the License.  
*/

import "dotenv/config";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";
import * as dotenv from "dotenv";
import { JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import fs from "fs";

const preArgv = yargs(hideBin(process.argv))
  .option("env", {
    type: "string",
    describe: "Archivo .env alternativo (ej: .env.controller)",
    default: ".env"
  })
  .help(false) 
  .parseSync();
 
const envFile = preArgv.env || ".env";
dotenv.config({ path: envFile, override: true });
console.log(chalk.blue(`Usando configuración desde: ${envFile}`));

const RPC_URL = process.env.RPC_URL!;
const ACCOUNT_PRIVATE_KEY = process.env.ACCOUNT_PRIVATE_KEY!;
if (!RPC_URL || !ACCOUNT_PRIVATE_KEY) {
  throw new Error("Faltan RPC_URL o ACCOUNT_PRIVATE_KEY en el archivo .env seleccionado");
}

const provider = new JsonRpcProvider(RPC_URL);
const wallet = new Wallet(ACCOUNT_PRIVATE_KEY, provider);
console.log(chalk.green(`Usando cuenta firmante: ${wallet.address}`));

import DidControllerCLI from "./commands/controller.js";
import DidDocument from "./commands/document.js";
import DidVerificationMethodCLI, { RollArgs } from "./commands/verification.js";
import DidVerificationRelationshipCLI from "./commands/relationship.js";
 
const controller = new DidControllerCLI();
const document = new DidDocument(provider, wallet);
const vMethod = new DidVerificationMethodCLI(RPC_URL, ACCOUNT_PRIVATE_KEY);
const relationship = new DidVerificationRelationshipCLI(RPC_URL, ACCOUNT_PRIVATE_KEY);
 
const abiJson = JSON.parse(
  fs.readFileSync(
    "../../contracts/did-isbe-registry/artifacts/contracts/identity/didregistry/IDidRegistry.sol/IDidRegistry.json",
    "utf8"
  )
);
const abi = abiJson.abi || abiJson;
const errors = abi.filter((x: any) => x.type === "error");
 
const errorSelectors: Record<string, string> = {};
for (const e of errors) {
  const sig = `${e.name}(${(e.inputs || []).map((i: any) => i.type).join(",")})`;
  const selector = keccak256(toUtf8Bytes(sig)).slice(0, 10);
  errorSelectors[selector] = sig;
}
 
function decodeAndLogError(err: any) {
  const data = err?.error?.data || err?.data;
  if (typeof data === "string" && data.startsWith("0x")) {
    const selector = data.slice(0, 10);
    if (errorSelectors[selector]) {
      console.error(
        chalk.red(`Revertido con error: ${errorSelectors[selector]} (${selector})`)
      );
    } else {
      console.error(chalk.red(`Revertido con selector desconocido: ${selector}`));
    }
  } else {
    console.error(chalk.red("Error:"), err?.message ?? err);
  }
}
yargs(hideBin(process.argv))
  .scriptName("did-registry")
  .option("env", {
    type: "string",
    describe: "Archivo .env alternativo",
    default: ".env"
  })
  .command("controller", "Operaciones sobre controllers", (y) =>
    y
      .command("add", "Añadir controller", (y) =>
        y.option("did", { type: "string", demandOption: true })
          .option("controllerDid", { type: "string", demandOption: true }),
        async (argv) => {
          try {
            const tx = await controller.addController(argv.did, argv.controllerDid);
            console.log("addController tx:", tx.hash);
          } catch (err) {
            decodeAndLogError(err);
          }
        }
      )
      .command("revoke", "Revocar controller", (y) =>
        y.option("did", { type: "string", demandOption: true })
          .option("controllerDid", { type: "string", demandOption: true }),
        async (argv) => {
          try {
            const tx = await controller.revokeController(argv.did, argv.controllerDid);
            console.log("revokeController tx:", tx.hash);
          } catch (err) {
            decodeAndLogError(err);
          }
        }
      )
      .command("check", "Verificar si una dirección es controller de un DID", (y) =>
        y.option("did", { type: "string", demandOption: true })
          .option("controllerAddr", { type: "string", demandOption: true }),
        async (argv) => {
          try {
            const { resString, resBytes } = await controller.checkController(argv.did, argv.controllerAddr);
            console.log(resString ? "Sí es controller (string)" : "No es controller (string)");
            console.log(resBytes ? "Sí es controller (bytes)" : "No es controller (bytes)");
          } catch (err: any) {
            console.error("Error en checkController:", err?.message ?? err);
          }
        }
      )
  )
  .command("document", "Operaciones sobre documentos", (y) =>
    y
      .command("init", "Inicializar registro", () => {}, async () => {
        try {
          const res = await document.init();
          console.log(res);
        } catch (err) {
          decodeAndLogError(err);
        }
      })
      .command("create-stable", "Crear un DID basado en tu wallet", (yargs) =>
        yargs
          .option("modelDeployId", { type: "string", demandOption: true })
          .option("vMethodId", { type: "string", demandOption: true })
          .option("ellipticType", { type: "number", default: 1 })
          .option("validityDays", { type: "number", default: 365 }),
        async (args) => {
          await document.createFromWallet(
            args.modelDeployId,
            args.vMethodId,
            args.ellipticType,
            args.validityDays
          );
        }
      )
      .command("get", "Obtener un documento DID", (y) =>
        y
          .option("did", { type: "string", demandOption: true })
          .option("format", {
            type: "string",
            choices: ["hex", "jwk"],
            default: "hex",
            describe: "Formato de salida de la clave pública",
          })
          .option("omitContext", {
            type: "boolean",
            default: false,
            describe: "Omitir el campo @context del documento base",
          }),
        async (argv) => {
          try {
            await document.get(argv.did, argv.format as "hex" | "jwk", !argv.omitContext);
          } catch (err: any) {
            console.error("Error en getDidDocument:", err?.message ?? err);
          }
        }
      )
      .command("getByTimestamp", "Obtener documento por timestamp", (y) =>
        y
          .option("did", { type: "string", demandOption: true })
          .option("timestamp", { type: "number", demandOption: true })
          .option("format", {
            type: "string",
            choices: ["hex", "jwk"],
            default: "hex",
            describe: "Formato de salida de la clave pública",
          }),
        async (argv) => {
          try {
            const doc = await document.getByTimestamp(argv.did, argv.timestamp, argv.format as "hex" | "jwk");
            console.log("document @ timestamp:", doc);
          } catch (err) {
            decodeAndLogError(err);
          }
        }
      )
      .command("list", "Listar DIDs", (y) =>
        y.option("page", { type: "number", default: 1 })
          .option("pageSize", { type: "number", default: 10 }),
        async (argv) => {
          try {
            await document.list(argv.page, argv.pageSize);
            console.log("listDids: completa");
          } catch (err) {
            decodeAndLogError(err);
          }
        }
      )
      .command("update", "Actualizar documento", (y) =>
        y.option("did", { type: "string", demandOption: true })
          .option("newDoc", { type: "string", demandOption: true }),
        async (argv) => {
          try {
            let newDocClean: string;
            try {
              const parsed = JSON.parse(argv.newDoc);
              newDocClean = JSON.stringify(parsed);
            } catch {
              let fixed = argv.newDoc.replace(/([{,]\s*)([a-zA-Z0-9@_]+)(\s*:)/g, '$1"$2"$3');
              fixed = fixed.replace(/:\s*([a-zA-Z0-9@.:/=_-]+)(?=[,}])/g, ':"$1"');
              const parsed = JSON.parse(fixed);
              newDocClean = JSON.stringify(parsed);
            }
            const tx = await document.update(argv.did, newDocClean);
            if (tx && typeof tx === "object" && "hash" in tx) {
              console.log("updateDocument tx:", tx.hash);
            } else {
              console.log("updateDocument: no se devolvió transacción");
            }
          } catch (err) {
            decodeAndLogError(err);
          }
        }
      )
  )
  .command("verification", "Operaciones sobre verification methods", (y) =>
    y
      .command("add", "Añadir verification method", (y) =>
        y.option("did", { type: "string", demandOption: true })
          .option("vMethodId", { type: "string", demandOption: true })
          .option("publicKey", { type: "string", demandOption: true })
          .option("ellipticType", { type: "number", default: 1 }),
        async (argv) => {
          try {
            const tx = await vMethod.add(argv.did, argv.vMethodId, argv.publicKey, argv.ellipticType);
            console.log("addVerificationMethod tx:", tx.hash);
          } catch (err) {
            decodeAndLogError(err);
          }
        }
      )
      .command("expire", "Expirar verification method", (y) =>
        y.option("did", { type: "string", demandOption: true })
          .option("vMethodId", { type: "string", demandOption: true })
          .option("notAfter", { type: "number", demandOption: true }),
        async (argv) => {
          try {
            const tx = await vMethod.expire(argv.did, argv.vMethodId, argv.notAfter);
            console.log("expire tx:", tx.hash);
          } catch (err) {
            decodeAndLogError(err);
          }
        }
      )
      .command("revoke", "Revocar verification method", (y) =>
        y.option("did", { type: "string", demandOption: true })
          .option("vMethodId", { type: "string", demandOption: true })
          .option("notAfter", { type: "number", demandOption: true }),
        async (argv) => {
          try {
            const tx = await vMethod.revoke(argv.did, argv.vMethodId, argv.notAfter);
            console.log("revokeVerificationMethod tx:", tx.hash);
          } catch (err) {
            decodeAndLogError(err);
          }
        }
      )
      .command("roll", "Rollover verification method", (y) =>
        y.option("did", { type: "string", demandOption: true })
          .option("oldVMethodId", { type: "string", demandOption: true })
          .option("vMethodId", { type: "string", demandOption: true })
          .option("publicKey", { type: "string", demandOption: true })
          .option("ellipticType", { type: "number", default: 1 })
          .option("notBefore", { type: "number", demandOption: true })
          .option("notAfter", { type: "number", demandOption: true })
          .option("duration", { type: "number", demandOption: true }),
        async (argv) => {
          try {
            const args: RollArgs = {
              did: argv.did,
              oldVMethodId: argv.oldVMethodId,
              vMethodId: argv.vMethodId,
              publicKey: argv.publicKey,
              ellipticType: argv.ellipticType,
              notBefore: argv.notBefore,
              notAfter: argv.notAfter,
              duration: argv.duration,
            };
            const tx = await vMethod.roll(args);
            console.log("rollVerificationMethod tx:", tx.hash);
          } catch (err) {
            decodeAndLogError(err);
          }
        }
      )
  )
  .command("relationship", "Operaciones sobre relaciones", (y) =>
    y
      .command("add", "Añadir relación", (y) =>
        y.option("did", { type: "string", demandOption: true })
          .option("name", { type: "string", demandOption: true })
          .option("vMethodId", { type: "string", demandOption: true })
          .option("notBefore", { type: "number", demandOption: true })
          .option("notAfter", { type: "number", demandOption: true }),
        async (argv) => {
          try {
            const tx = await relationship.add(argv.did, argv.name, argv.vMethodId, argv.notBefore, argv.notAfter);
            console.log("addVerificationRelationship tx:", tx.hash);
          } catch (err) {
            decodeAndLogError(err);
          }
        }
      )
      .command("list", "Listar DIDs por relación", (y) =>
        y.option("vMethodId", { type: "string", demandOption: true })
          .option("name", { type: "string", demandOption: true })
          .option("page", { type: "number", default: 1 })
          .option("pageSize", { type: "number", default: 10 }),
        async (argv) => {
          try {
            await relationship.list(argv.vMethodId, argv.name, argv.page, argv.pageSize);
          } catch (err) {
            decodeAndLogError(err);
          }
        }
      )
  )
  .demandCommand(1, "Debes indicar un comando válido")
  .strictCommands()
  .help()
  .parseAsync();