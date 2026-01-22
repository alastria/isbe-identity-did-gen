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

import { Command } from "commander";
import chalk from "chalk";
import { generateOffchainDid } from "./commands/document";

const program = new Command();

program
  .name("did-cli")
  .description("ISBE DID CLI - Genera DID/PublicKey/Proof sin conectar a API ni nodo")
  .version("1.0.0");

program
  .command("generate")
  .description("Genera DID + PublicKey + Proof ")
  .requiredOption("--privKey <hex>", "Private key hex 32 bytes (con o sin 0x)")
  .option("--curve <num>", "1=secp256k1, 2=p256. Default: 1", "1")
  .option("--modelDeployId <id>", "Namespace para child. Default: uc", "uc")
  .option("--baseDocument <json>", 'Base document JSON string. Default: "{}"', "{}")
  .option("--alsoKnownAs <list>", 'CSV. Ej: "did:example:1,did:example:2"', "")
  .option("--durationDays <n>", "Duración en días. Default: 365", "365")
  .option("--mode <mode>", "simple | debug | json. Default: simple", "simple")
  .action(async (opts) => {
    try {
      const curve = Number(String(opts.curve).trim());
      if (curve !== 1 && curve !== 2) {
        throw new Error('Curva inválida. Usa --curve "1" o --curve "2".');
      }

      const durationDays = Number(String(opts.durationDays).trim());
      if (!Number.isFinite(durationDays) || durationDays <= 0) {
        throw new Error("--durationDays debe ser un número > 0.");
      }

      const baseDocument = String(opts.baseDocument ?? "{}").trim();
      try {
        JSON.parse(baseDocument);
      } catch {
        throw new Error("--baseDocument debe ser un JSON válido en string.");
      }

      const akaRaw = String(opts.alsoKnownAs ?? "").trim();
      const alsoKnownAs =
        akaRaw.length > 0
          ? akaRaw.split(",").map((x) => x.trim()).filter(Boolean)
          : undefined;

      const modeRaw = String(opts.mode ?? "simple").trim().toLowerCase();
      const mode: "simple" | "debug" | "json" =
        modeRaw === "debug" || modeRaw === "json" ? modeRaw : "simple";
      const modelDeployId = String(opts.modelDeployId ?? "").trim() || "uc";
      
      const output = generateOffchainDid({
        privKey: String(opts.privKey),
        ellipticType: curve as 1 | 2,
        modelDeployId,
        baseDocument,
        alsoKnownAs,
        durationDays,
      });

      if (mode === "json") {
        console.log(JSON.stringify(output, null, 2));
        return;
      }

      console.log("\n" + chalk.cyan("══════════════════════════════════════"));
      console.log(chalk.cyan(" DID generado"));
      console.log(chalk.cyan("══════════════════════════════════════\n"));

      console.log(chalk.white("DID:"));
      console.log(chalk.green(output.did) + "\n");

      console.log(chalk.white("Clave pública (hex):"));
      console.log(chalk.green(output.publicKeyHex) + "\n");

      console.log(chalk.white("Prueba criptográfica:"));
      console.log(chalk.green(output.proofHex) + "\n");

      console.log(JSON.stringify(output.publicKeyJwk, null, 2) + "\n");

      if (mode === "debug") {
        console.log(chalk.yellow("Debug / auditoría:\n"));
        console.log(chalk.gray(`namespace: ${output.namespace}`));
        console.log(chalk.gray(`methodSpecificId: ${output.methodSpecificId}`));
        console.log(chalk.gray(`vMethodId: ${output.vMethodId}`));
        console.log(chalk.gray(`ellipticType: ${output.ellipticType}`));
        console.log(chalk.gray(`notBefore: ${output.notBefore}`));
        console.log(chalk.gray(`notAfter:  ${output.notAfter}`));
        console.log(chalk.gray(`hashToSign: ${output.hashToSign}`));
        console.log(chalk.gray(`proofRsv:  ${output.proofRsv}`));
        console.log(chalk.gray(`baseDocument: ${output.baseDocument}`));
        if (output.alsoKnownAs?.length) {
          console.log(chalk.gray(`alsoKnownAs: ${JSON.stringify(output.alsoKnownAs)}`));
        }

        console.log(chalk.cyan("\nPayload sugerido (insertDidDocument / insertFirstDidDocument):\n"));
        const payloadInsertDidDocument = {
          did: output.did,
          baseDocument: output.baseDocument,
          vMethodId: output.vMethodId,
          publicKey: JSON.stringify(output.publicKeyJwk),
          ellipticType: output.ellipticType,
          notBefore: output.notBefore,
          notAfter: output.notAfter,
        };
        console.log(chalk.gray(JSON.stringify(payloadInsertDidDocument, null, 2)) + "\n");

        console.log(chalk.cyan("Output completo:\n"));
        console.log(chalk.gray(JSON.stringify(output, null, 2)) + "\n");
      }
    } catch (err: any) {
      console.error(chalk.red(" Error:"), err?.message || err);
      process.exitCode = 1;
    }
  });

program.showHelpAfterError(true);
program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
