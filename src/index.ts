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
import { getPublicKey } from "./utils";
import { AcceptedCurves } from "./types";
import { buildDID, generateProof } from "./commands/did";
import { generateKeys } from "./commands/keys";

const program = new Command();

function parseCurve(curveInput: unknown): AcceptedCurves {
  const curve = String(curveInput ?? "").trim() || "secp256k1";
  if (curve !== "secp256k1" && curve !== "P-256") {
    throw new Error(
      'Invalid curve. Use --curve "secp256k1" or --curve "P-256".',
    );
  }
  return curve;
}

program
  .name("did-gen")
  .description("DID ISBE Generator - CLI tool to generate DIDs for ISBE")
  .version("2.0.0");

program
  .command("did")
  .description("Generate DID + PublicKey + Proof")
  .requiredOption("-p, --privKey <hex>", "Private key hex 32 bytes")
  .option(
    "-c, --curve <string>",
    "secp256k1, P-256. Default: secp256k1",
    "secp256k1",
  )
  .option("-m, --modelDeploy <string>", "Model Deploy. Default: uc", "uc")
  .action(async (opts) => {
    try {
      const curve = parseCurve(opts.curve);

      const modelDeploy = String(opts.modelDeploy ?? "").trim() || "uc";

      const proof = generateProof(opts.privKey, curve);
      const publicKey = getPublicKey(opts.privKey, curve);
      const did = buildDID(proof, modelDeploy);

      console.log();

      console.log(chalk.green("DID:"));
      console.log(chalk.white(did) + "\n");

      console.log(chalk.green("Public Key:"));
      console.log(chalk.white(publicKey) + "\n");

      console.log(chalk.green("Proof:"));
      console.log(chalk.white(proof) + "\n");
    } catch (err: any) {
      console.error(chalk.red(" Error:"), err?.message || err);
      process.exitCode = 1;
    }
  });

program
  .command("keys")
  .description("Generate random private/public keys")
  .option(
    "-c, --curve <string>",
    "secp256k1, P-256. Default: secp256k1",
    "secp256k1",
  )
  .action(async (opts) => {
    try {
      const curve = parseCurve(opts.curve);
      const keys = generateKeys(curve);

      console.log();

      console.log(chalk.green("Private Key (hex):"));
      console.log(chalk.white(keys.privateKeyHex) + "\n");

      console.log(chalk.green("Public Key (hex):"));
      console.log(chalk.white(keys.publicKeyHex) + "\n");

      console.log(chalk.green("Private Key (JWK):"));
      console.log(chalk.white(JSON.stringify(keys.privateJwk, null, 2)) + "\n");

      console.log(chalk.green("Public Key (JWK):"));
      console.log(chalk.white(JSON.stringify(keys.publicJwk, null, 2)) + "\n");
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
