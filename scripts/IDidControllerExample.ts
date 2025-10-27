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

import IDidController from "../../../libs/did-isbe-lib/identity/didregistry/IDidController.js";
 
async function main() {

  const provider = new JsonRpcProvider(process.env.RPC_URL!);

  const wallet = new Wallet(process.env.ACCOUNT_PRIVATE_KEY!, provider);

  const didCtrl = new IDidController(provider, wallet);
 
  const did = "did:isbe:bare-deploy-01:0ebc7a7ae898ed7b8021a11beaa550e12b694a51b0d9a2ace752495a3a502f78";

  const controllerDid = "did:isbe:bare-deploy-01:4da8778390571a0849e3bc2ed846330bb05eecb15f0b1cb2c57bcc19c78c8409";

  const controllerAddr = "0x9B3Db5035bE93081a6782727Faa1B2Efc7556C87";
 
  console.log(chalk.blue(`RPC: ${process.env.RPC_URL}`));

  console.log(chalk.blue(`Usando cuenta firmante: ${wallet.address}`));
 
  // Add

  console.log(chalk.yellow(`Añadiendo controller ${controllerDid} al DID ${did}`));

  const receiptAdd = await didCtrl.addController(did, controllerDid);

  console.log(chalk.green("✔ addController tx:"), receiptAdd.hash);
 
  // Check después de add

  const res4 = await didCtrl.checkController(did, controllerAddr);

  console.log(`checkController(string) → ${res4}`);
 
  const res5 = await didCtrl.checkControllerBytes(ethers.toUtf8Bytes(did), controllerAddr);

  console.log(`checkController(bytes) → ${res5}`);
 
  const res6 = await didCtrl.getDidsByController(controllerDid, 1, 10);

  console.log("getDidsByController →", res6);
 
  // Revoke

  console.log(chalk.yellow(`Revocando controller ${controllerDid} del DID ${did}`));

  const receiptRevoke = await didCtrl.revokeController(did, controllerDid);

  console.log(chalk.green("✔ revokeController tx:"), receiptRevoke.hash);
 
  // Check después de revoke

  const res7 = await didCtrl.checkController(did, controllerAddr);

  console.log(`checkController(string) → ${res7}`);
 
  const res8 = await didCtrl.checkControllerBytes(ethers.toUtf8Bytes(did), controllerAddr);

  console.log(`checkController(bytes) → ${res8}`);
 
  const res9 = await didCtrl.getDidsByController(controllerDid, 1, 10);

  console.log("getDidsByController →", res9);

}
 
main().catch((err) => {

  console.error(chalk.red("❌ Script error:"), err);

  process.exit(1);

});