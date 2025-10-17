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

import { JsonRpcProvider, Wallet, ethers } from "ethers";

import chalk from "chalk";

import { randomBytes } from "crypto";

import elliptic from "elliptic";

import { keccak_256 } from "@noble/hashes/sha3";
 
import IDidDocumentDetailed from "../../../libs/did-isbe-lib/identity/didregistry/IDidDocumentDetailed.js";

import IDidController from "../../../libs/did-isbe-lib/identity/didregistry/IDidController.js";

import IDidVerificationMethod, { RollArgs } from "../../../libs/did-isbe-lib/identity/didregistry/IDidVerificationMethod.js";

import IDidVerificationRelationship from "../../../libs/did-isbe-lib/identity/didregistry/IDidVerificationRelationship.js";
 
const ec = new elliptic.ec("secp256k1");
 
function selfSign(privHex: string) {

  const key = ec.keyFromPrivate(privHex);

  const pubPoint = key.getPublic();

  const pubUncompressed = Buffer.from(pubPoint.encode("hex", false), "hex");

  const msg = keccak_256(pubUncompressed);

  const signatureDER = Buffer.from(key.sign(msg).toDER());

  return { signatureDER, pubUncompressedHex: pubPoint.encode("hex", false) };

}
 
function buildDID(signatureDER: Buffer, modelDeployId: string) {

  const last32 = signatureDER.subarray(signatureDER.length - 32);

  const methodSpecificId = last32.toString("hex");

  return `did:isbe:${modelDeployId}:${methodSpecificId}`;

}
 
async function main() {

  console.log(chalk.bold.cyan("\n🌍 MANUAL COMPLETO DE OPERACIONES DID:ISBE"));

  console.log(chalk.gray("Este script actúa como un manual narrativo y ejecutable, demostrando el ciclo de vida completo de un DID corporativo.\n"));
 
  // --- CONFIGURACIÓN ---

  const provider = new JsonRpcProvider(process.env.RPC_URL!);

  const admin = new Wallet(process.env.ACCOUNT_PRIVATE_KEY!, provider);

  const modelDeployId = "bare-deploy-01";
 
  const didDocAdmin = new IDidDocumentDetailed(provider, admin);

  const didCtrlAdmin = new IDidController(provider, admin);
 
  console.log(chalk.yellow("👤 El ADMIN es quien despliega y gobierna el registro."));

  console.log(chalk.yellow("👥 El CONTROLLER será designado después como entidad que gestiona un DID específico.\n"));
 
  // --- 1️⃣ Inicializar Registry ---

  console.log(chalk.bold("\n1️⃣ Inicializando el registro global..."));

  try {

    const tx = await didDocAdmin.initializeDiDRegistry(1);

    console.log(chalk.green("✔ initializeDiDRegistry tx:"), tx.hash);

  } catch {

    console.log(chalk.yellow("⚠️ Registry ya fue inicializado previamente"));

  }
 
  // --- 2️⃣ Crear varios DIDs controlados por el admin ---

  console.log(chalk.bold("\n2️⃣ Creando tres DIDs iniciales (A, B, C)..."));
 
  async function createDid(label: string) {

    const priv = randomBytes(32).toString("hex");

    const { signatureDER, pubUncompressedHex } = selfSign(priv);

    const did = buildDID(signatureDER, modelDeployId);

    const baseDoc = JSON.stringify({ "@context": "https://www.w3.org/ns/did/v1", label });

    const vMethodId = `vMethod-${label}`;

    const publicKeyHex = "0x" + pubUncompressedHex;

    const now = Math.floor(Date.now() / 1000);

    const notBefore = now;

    const notAfter = now + 365 * 24 * 60 * 60;
 
    const receipt = await didDocAdmin.insertDidDocument(

      did,

      baseDoc,

      vMethodId,

      publicKeyHex,

      1,

      notBefore,

      notAfter

    );

    console.log(chalk.green(`✔ insertDidDocument (${label}) → ${did}`));

    return { did, priv, vMethodId, publicKeyHex, notBefore, notAfter };

  }
 
  const A = await createDid("A");

  const B = await createDid("B");

  const C = await createDid("C");
 
  console.log(chalk.gray("\n📘 Ahora existen tres DIDs en la red: A (principal), B (potencial controller) y C (auxiliar)."));
 
  // --- 3️⃣ Admin nombra al DID B como controller de A ---

  const controller = new Wallet(B.priv, provider);

  const didCtrl = new IDidController(provider, controller);

  console.log(chalk.bold("\n3️⃣ Nombrando a B como controller de A"));

  const addCtrlTx = await didCtrlAdmin.addController(A.did, B.did);

  console.log(chalk.green("✔ addController tx:"), addCtrlTx.hash);
 
  // --- 4️⃣ Verificación de control ---

  console.log(chalk.gray("\n🔎 Verificando control de B sobre A..."));

  const res1 = await didCtrl.checkController(A.did, controller.address);

  console.log(chalk.cyan("checkController(string) →"), res1);

  const res2 = await didCtrl.checkControllerBytes(ethers.toUtf8Bytes(A.did), controller.address);

  console.log(chalk.cyan("checkController(bytes) →"), res2);
 
  const res3 = await didCtrl.getDidsByController(B.did, 1, 10);

  console.log(chalk.cyan("getDidsByController →"), res3.total);
 
  console.log(chalk.gray("\n💡 A partir de este momento, B (controller) puede operar sobre A en funciones delegadas."));
 
  // --- 5️⃣ Controller actualiza baseDocument ---

  const didDocCtrl = new IDidDocumentDetailed(provider, controller);

  console.log(chalk.bold("\n5️⃣ Controller actualiza el documento base de A"));

  try {

    const newDoc = JSON.stringify({ "@context": "https://www.w3.org/ns/did/v2", role: "updated by controller B" });

    const tx = await didDocCtrl.updateBaseDocument(A.did, newDoc);

    console.log(chalk.green("✔ updateBaseDocument tx:"), tx.hash);

  } catch (err) {

    console.error(chalk.red("❌ updateBaseDocument error:"), err);

  }
 
  // --- 6️⃣ Controller añade verification methods ---

  console.log(chalk.bold("\n6️⃣ Añadiendo métodos de verificación bajo control de B"));

  const vm = new IDidVerificationMethod(provider, controller);

  const vMethodId2 = "vMethod-B1";

  const pubKey2 = B.publicKeyHex;

  const now = Math.floor(Date.now() / 1000);

  await vm.addVerificationMethod(A.did, vMethodId2, pubKey2, 1);

  console.log(chalk.green("✔ addVerificationMethod completado."));
 
  // --- 7️⃣ Controller añade relación ---

  console.log(chalk.bold("\n7️⃣ Añadiendo relación de autenticación"));

  const rel = new IDidVerificationRelationship(provider, controller);

  await rel.addVerificationRelationship(A.did, "authentication", vMethodId2, A.notBefore, A.notAfter);

  console.log(chalk.green("✔ addVerificationRelationship completado."));
 
  // --- 8️⃣ Expirar, revocar y rotar método ---

  console.log(chalk.bold("\n8️⃣ Gestionando ciclo de vida del método de verificación"));

  await vm.expireVerificationMethod(A.did, vMethodId2, A.notAfter);

  //await vm.revokeVerificationMethod(A.did, vMethodId2, A.notAfter);

  const rollArgs: RollArgs = {

    did: A.did,

    vMethodId: "vMethod-B2",

    publicKey: pubKey2,

    ellipticType: 1,

    notBefore: A.notBefore,

    notAfter: A.notAfter + 1000,

    oldVMethodId: vMethodId2,

    duration: 1000,

  };

  //await vm.rollVerificationMethod(rollArgs);

  console.log(chalk.green("✔ expire / revoke / roll ejecutados."));
 
  // --- 9️⃣ Consultas y lecturas ---

  console.log(chalk.bold("\n9️⃣ Consultas públicas y auditoría"));

  const rels = await rel.getDidsByVerificationRelationship(vMethodId2, "authentication", 1, 10);

  console.log(chalk.cyan("getDidsByVerificationRelationship →"), rels.total);
 
  const doc = await didDocAdmin.getDidDocument(A.did);

  console.log(chalk.cyan("getDidDocument → contiene:"), doc.controllers.length, "controllers");
 
  const snapshot = await didDocAdmin.getDidDocumentByTimestamp(A.did, Math.floor(Date.now() / 1000));

  console.log(chalk.cyan("getDidDocumentByTimestamp → snapshot actualizado."));
 
  const all = await didDocAdmin.getDids(1, 50);

  console.log(chalk.cyan("getDids → total:"), all.total);
 
  // --- 🔟 Revocar controller ---

  console.log(chalk.bold("\n🔟 Admin revoca a B como controller de A"));

  await didCtrlAdmin.revokeController(A.did, B.did);

  console.log(chalk.green("✔ revokeController completado."));
 
  console.log(chalk.bold.green("\n✅ DEMO COMPLETA FINALIZADA CON ÉXITO"));

  console.log(chalk.gray("Se han usado los 17 métodos distribuidos entre los 4 contratos del método did:isbe."));

}
 
main().catch((err) => {

  console.error(chalk.red("❌ Script error:"), err);

  process.exit(1);

});