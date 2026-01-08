/**
* Copyright (c) 2025 Comunidad de Madrid & Alastria
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
*
* You may obtain a copy of the License at
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
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
import DidRelationship from "./commands/relationship";
import { isRegistryInitialized } from "./utils/isRegistryInitialized";
import { loadRootWallet } from "./utils/loadRootWallet";
import { findDID } from "./utils/localStorage";
import { loadEllipticType } from "./utils/curveConfi";
import { ControllerCommands } from "./commands/controller";
import VerificationCLI from "./commands/verification";
import fs from "fs";

const RPC_URL = process.env.RPC_URL!;
const PRIVATE_KEY = process.env.ACCOUNT_PRIVATE_KEY!;
const DID_REGISTRY_ADDRESS = process.env.DID_REGISTRY_ADDRESS!;
const API_BASE = process.env.API_BASE;

if (!API_BASE) throw new Error("Falta API URL (API_BASE) en .env");
if (!RPC_URL || !PRIVATE_KEY || !DID_REGISTRY_ADDRESS) {
  throw new Error("Faltan variables en .env");
}

const normalizedPrivateKey = PRIVATE_KEY.startsWith("0x")
  ? PRIVATE_KEY
  : "0x" + PRIVATE_KEY;

const provider = new JsonRpcProvider(RPC_URL);
const signer = new Wallet(normalizedPrivateKey, provider);
const cmd = process.argv[2];

let signerToUse = signer;

function loadRootWalletFromEnv(provider: JsonRpcProvider) {
  const rootPk = process.env.ROOT_PRIVATE_KEY;
  if (!rootPk) {
    throw new Error("Falta ROOT_PRIVATE_KEY en .env (requerido para comandos que necesitan root signer).");
  }
  const normalized = rootPk.startsWith("0x") ? rootPk : "0x" + rootPk;
  return new Wallet(normalized, provider);
}

if (cmd !== "init" && cmd !== "create-root") {
  signerToUse = loadRootWalletFromEnv(provider);
  console.log(" Usando ROOT WALLET desde ROOT_PRIVATE_KEY:", signerToUse.address);
}

const ellipticTypeFromConfig = loadEllipticType();
console.log(
  `Curva por defecto desde .curve_config (si existe): ellipticType=${ellipticTypeFromConfig}`
);

const didCLI = new DidCommands(provider, signerToUse, RPC_URL, ellipticTypeFromConfig);

const program = new Command();
const controllerCmd = new ControllerCommands(provider, signerToUse, RPC_URL);
(controllerCmd as any).buildSignSend = didCLI.buildSignSend.bind(didCLI);

function initEnvironment() {
  const relationship = new DidRelationship(provider, signerToUse, RPC_URL);
  const verification = new VerificationCLI(provider, signerToUse);
  return { relationship, verification };
}
function assertValidJwkJson(input: string, flagName = "--jwk") {
  try {
    const obj = JSON.parse(input);
    if (!obj || typeof obj !== "object") throw new Error();
  } catch {
    throw new Error(`El valor de ${flagName} no es un JSON válido. Pásalo entre comillas simples: --jwk '{"kty":"EC",...}'`);
  }
}
program
  .command("init")
  .argument("<ellipticType>", "Tipo de curva elíptica")
  .action(async (ellipticType) => {
    const alreadyInitialized = await isRegistryInitialized(provider, DID_REGISTRY_ADDRESS);
    if (alreadyInitialized) {
      console.log("El registro ya fue inicializado.");
      return;
    }
    await didCLI.init(Number(ellipticType));
  });

program
  .command("create-root")
  .argument("<privKey>", "Private key para generar el primer DID (sujeto)")
  .argument(
    "[baseDocumentPos]",
    "Documento base del DID (opcional, si no se usa --baseDocument)"
  )
  .option(
    "--baseDocument <json>",
    "Documento base (si contiene caracteres especiales, pásalo con --baseDocument '<json>')"
  )
  .option("--aka <alsoKnownAs>", "Alias")
  .description("Crea el Root DID")
  .action(async (privKey: string, baseDocumentPos: string | undefined, opts: any) => {
    try {
      const baseDocument = opts.baseDocument ?? baseDocumentPos ?? "{}";
      try {
        JSON.parse(baseDocument);
      } catch {
        console.error(
          chalk.red(
            "El baseDocument no es un JSON válido. Pásalo entre comillas o usa --baseDocument '<json>'"
          )
        );
        return;
      }

      const normalized = privKey.startsWith("0x") ? privKey : "0x" + privKey;
      const result = await didCLI.createRoot(normalized, baseDocument, opts.aka);

      console.log(chalk.green("\nRoot DID creado correctamente:\n"));
      console.log(JSON.stringify(result, null, 2));

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
      } catch {
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
  .description("Lista los DIDs almacenados en la blockchain con paginación")
  .option("--page <num>", "Página", "1")
  .option("--pageSize <num>", "Tamaño de página", "10")
  .action(async (opts) => {
    try {
      const page = Number(opts.page);
      const size = Number(opts.pageSize);

      const result = await didCLI.listOnChainDIDs(page, size);
      const { items = [], total } = result ?? {};

      console.log("\n" + chalk.cyan("══════════════════════════════════════════════"));
      console.log(chalk.cyan("         DIDs encontrados on-chain"));
      console.log(chalk.cyan("══════════════════════════════════════════════\n"));

      console.log(chalk.white(`Página: ${page}     Tamaño: ${size}`));
      console.log(chalk.white(`Total DIDs: ${total}\n`));

      if (!items.length) {
        console.log(chalk.yellow("No hay DIDs en blockchain para esta página.\n"));
        return;
      }

      console.log(
        chalk.cyan(
          "╔══════╦════════════════════════════════════════════════════════════════════════════════════╗"
        )
      );
      console.log(
        chalk.cyan(
          "║  #   ║ DID                                                                               ║"
        )
      );
      console.log(
        chalk.cyan(
          "╠══════╬════════════════════════════════════════════════════════════════════════════════════╣"
        )
      );

      items.forEach((did: string, index: number) => {
        console.log(chalk.white(`║  ${String(index + 1).padEnd(3)} ║ ${did.padEnd(82)} ║`));
      });

      console.log(
        chalk.cyan(
          "╚══════╩════════════════════════════════════════════════════════════════════════════════════╝"
        )
      );
      console.log();
    } catch (err: any) {
      console.error(chalk.red("Error en list:"), err.message || err);
    }
  });


program
  .command("get-did")
  .requiredOption("--did <did>", "DID a consultar")
  .action(async (opts) => {
    try {
      const onchain = await didCLI.getDidOnChain(opts.did); 
      if (!onchain) return;

      console.log(chalk.blueBright("\nInformación dids (on-chain)"));
      console.log(chalk.blueBright("\nInformación dids"));
      console.log(JSON.stringify({ onchain}, null, 2));
    } catch (e: any) {
      console.error(chalk.red("Error en get-did:"), e.message || e);
    }
  });


program
  .command("get-did-by-timestamp-onchain")
  .requiredOption("--did <did>", "DID a consultar")
  .requiredOption("--timestamp <ts>", "Timestamp en segundos")
  .description("Consulta un DID histórico directamente en blockchain (vía API)")
  .action(async (opts) => {
    try {
      await didCLI.getDidByTimestampOnChain(opts.did, Number(opts.timestamp)); 
    } catch (e: any) {
      console.error(chalk.red("Error en get-did-by-timestamp-onchain:"), e.message || e);
    }
  });


program
  .command("get-did-by-timestamp")
  .requiredOption("--did <did>", "DID a consultar")
  .requiredOption("--timestamp <ts>", "Timestamp en segundos")
  .description("Alias de get-did-by-timestamp-onchain (API)")
  .action(async (opts) => {
    try {
      await didCLI.getDidByTimestampOnChain(opts.did, Number(opts.timestamp));
    } catch (e: any) {
      console.error(chalk.red("Error en get-did-by-timestamp:"), e.message || e);
    }
  });


program
  .command("add-vm")
  .requiredOption("--did <did>", "DID")
  .requiredOption("--jwk <json>", "Public key en formato JWK (string JSON)")
  .option("--curve <num>", "EllipticType", "1")
  .description("Añade un verificationMethod (publicKey SOLO JWK)")
  .action(async (opts) => {
      assertValidJwkJson(opts.jwk, "--jwk");
      const { relationship } = initEnvironment();
      await relationship.addVerificationMethod(opts.did, opts.jwk, Number(opts.curve));
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
    await relationship.expireVerificationMethod(opts.did, opts.fragment, Number(opts.notAfter));
  });


program
  .command("roll-vm")
  .requiredOption("--did <did>", "DID")
  .requiredOption("--old <frag>", "Fragment viejo")
  .requiredOption("--jwk <json>", "Nueva public key en formato JWK (string JSON)")
  .option("--curve <num>", "EllipticType", "1")
  .option("--duration <num>", "Duración de validez (segundos)", "31536000")
  .description("Rota (roll) un verificationMethod (publicKey SOLO JWK)")
  .action(async (opts) => {
    assertValidJwkJson(opts.jwk, "--jwk");
    const { relationship } = initEnvironment();
    await relationship.rollVerificationMethod(opts.did, opts.old, opts.jwk, Number(opts.curve), Number(opts.duration));
  });

program
  .command("add-controller")
  .requiredOption("--did <did>", "DID controlado")
  .requiredOption("--controller <controllerDid>", "DID controller")
  .action(async (opts) => {
    await controllerCmd.addController(opts.did, opts.controller);
  });

program
  .command("revoke-controller")
  .requiredOption("--did <did>", "DID controlado")
  .requiredOption("--controller <controllerDid>", "DID controller")
  .action(async (opts) => {
    await controllerCmd.revokeController(opts.did, opts.controller);
  });

program
  .command("check-controller")
  .requiredOption("--did <did>", "DID controlado")
  .requiredOption(
    "--controller-address <addr>",
    "Address del controller (wallet) O DID del controller"
  )
  .action(async (opts) => {
    await controllerCmd.checkController(opts.did, opts.controllerAddress);
  });

program
  .command("list-dids-by-controller")
  .requiredOption(
    "--controller <did>",
    "DID del controller (ej: did:isbe:usecase-demo-01:...)"
  )
  .option("--page <n>", "Página", "1")
  .option("--pageSize <n>", "Tamaño de página", "10")
  .action(async (opts) => {
    await controllerCmd.listDidsByController(opts.controller, Number(opts.page), Number(opts.pageSize));
  });

program
  .command("add-verification-rel")
  .requiredOption("--did <did>", "DID objetivo")
  .requiredOption("--name <string>", "Nombre de la relación (authentication, assertionMethod, etc.)")
  .requiredOption("--vm <vMethodId>", "Verification Method ID")
  .option("--notBefore <num>", "Timestamp notBefore", "")
  .option("--notAfter <num>", "Timestamp notAfter", "")
  .action(async (opts) => {
    const nb = opts.notBefore ? Number(opts.notBefore) : undefined;
    const na = opts.notAfter ? Number(opts.notAfter) : undefined;
    const { verification } = initEnvironment();
    await verification.addRelationship(opts.did, opts.name, opts.vm, nb, na);
  });

program
  .command("list-dids-by-verification-rel")
  .requiredOption("--vm <vMethodId>", "Verification Method ID")
  .requiredOption("--name <string>", "Nombre del verification relationship")
  .option("--page <num>", "Página", "1")
  .option("--pageSize <num>", "Tamaño de página", "10")
  .action(async (opts) => {
    const { verification } = initEnvironment();
    await verification.listDidsByRelationship(opts.vm, opts.name, Number(opts.page), Number(opts.pageSize));
  });

program.parse();
