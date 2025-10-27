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
import { JsonRpcProvider, Wallet } from "ethers";
import chalk from "chalk";
import { randomBytes } from "crypto";
import elliptic from "elliptic";
import { keccak_256 } from "@noble/hashes/sha3";
import IDidController from "../../../libs/did-isbe-lib/identity/didregistry/IDidController.js";
import IDidDocumentDetailed from "../../../libs/did-isbe-lib/identity/didregistry/IDidDocumentDetailed.js";

const ec = new elliptic.ec("secp256k1");

function selfSign(privHex: string) {
  const key = ec.keyFromPrivate(privHex);
  const pubPoint = key.getPublic();
  const pubUncompressed = Buffer.from(pubPoint.encode("hex", false), "hex");
  const msg = keccak_256(pubUncompressed);
  key.sign(msg, { canonical: true });
  const signatureDER = Buffer.from(key.sign(msg).toDER());
  return {
    signatureDER,
    pubUncompressedHex: pubPoint.encode("hex", false),
  };
}

function buildDID(signatureDER: Buffer, modelDeployId: string) {
  const last32 = signatureDER.subarray(signatureDER.length - 32);
  const methodSpecificId = last32.toString("hex");
  return `did:isbe:${modelDeployId}:${methodSpecificId}`;
}

async function main() {
  const provider = new JsonRpcProvider(process.env.RPC_URL!);
  const wallet = new Wallet("0x7a4794474db4ce5c7a0540de227edee515db03c650a4f4c1ed46b45bc0038d98", provider);
  const didDoc = new IDidDocumentDetailed(provider, wallet);
  const modelDeployId = "bare-deploy-01";

  console.log(chalk.blue(`RPC: ${process.env.RPC_URL}`));
  console.log(chalk.blue(`Usando cuenta firmante: ${wallet.address}`));

  // 1. Inicializar (si aplica)
  try {
    const receipt = await didDoc.initializeDiDRegistry(1); // 1 = secp256k1
    console.log(chalk.green("✔ initializeDiDRegistry tx:"), receipt.hash);
  } catch {
    console.log(chalk.yellow("⚠️ initializeDiDRegistry ya fue llamado anteriormente"));
  }

  // 2. Crear DID y registrar
  const priv = randomBytes(32).toString("hex");
  console.log("Private key generada:" + priv);
  const pubKeySignature = selfSign(priv);
  const did = buildDID(pubKeySignature.signatureDER, modelDeployId);
  const publicKeyHex = "0x" + pubKeySignature.pubUncompressedHex;

  const baseDocument = JSON.stringify({ "@context": [
    "https://www.w3.org/ns/did/v1",
    "https://w3id.org/security/suites/jws-2020/v1"
  ]});
  const vMethodId = "vMethodId1";
  const ellipticType = 1;
  const now = Math.floor(Date.now() / 1000);
  const notBefore = now;
  const notAfter = now + 365 * 24 * 60 * 60;

  try {
    const receipt = await didDoc.insertDidDocument(
      did,
      baseDocument,
      vMethodId,
      publicKeyHex,
      ellipticType,
      notBefore,
      notAfter
    );
    console.log(chalk.green("✔ insertDidDocument tx:"), receipt.hash);
  } catch (err) {
    console.error(chalk.red("❌ Error en insertDidDocument:"), err);
  }

  // 3. Consultar getDidDocument
  const doc = await didDoc.getDidDocument(did);
  console.log(chalk.cyan("\ngetDidDocument →"));
  console.dir(doc, { depth: null, colors: true });

  // 4. Consultar getDidDocumentByTimestamp
  const didCtrl = new IDidController(provider, wallet);
  const docTs = await didDoc.getDidDocumentByTimestamp(did, now);
  console.log(chalk.cyan("\ngetDidDocumentByTimestamp →"));
  console.dir(docTs, { depth: null, colors: true });

  // 5. Consultar getDids (paginación) trabajar
  const allDids = await didDoc.getDids(1, 32);
  console.log(chalk.cyan("\ngetDids →"));
  for (const [i, d] of allDids.items.entries()) {
    console.log(`  ${i + 1}. ${d}`);
  }
  console.log(`  total: ${allDids.total}`);
  console.log(`  howMany: ${allDids.howMany}`);
  console.log(`  prev: ${allDids.prev}`);
  console.log(`  next: ${allDids.next}`);

  // 6. updateBaseDocument trabajar
  const receiptAdd = await didCtrl.addController(did, "did:isbe:bare-deploy-01:4da8778390571a0849e3bc2ed846330bb05eecb15f0b1cb2c57bcc19c78c8409");
  const res4 = await didCtrl.checkController(did, "0x9B3Db5035bE93081a6782727Faa1B2Efc7556C87");
  console.log(`checkController(string) → ${res4}`);

  const newBaseDoc = JSON.stringify({ "@context": "https://www.w3.org/ns/did/v2" });
  try {
    const receipt = await didDoc.updateBaseDocument(did, newBaseDoc);
    console.log(chalk.green("✔ updateBaseDocument tx:"), receipt.hash);
  } catch (err) {
    console.error(chalk.red("❌ Error en updateBaseDocument:"), err);
  }
}

main().catch((err) => {
  console.error(chalk.red("❌ Script error:"), err);
  process.exit(1);
});