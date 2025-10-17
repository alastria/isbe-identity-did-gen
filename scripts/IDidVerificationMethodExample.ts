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

import IDidVerificationMethod, {

  RollArgs,

} from "../../../libs/did-isbe-lib/identity/didregistry/IDidVerificationMethod.js";
 
async function main() {

  const provider = new JsonRpcProvider(process.env.RPC_URL!);

  const wallet = new Wallet(process.env.ACCOUNT_PRIVATE_KEY!, provider);
 
  const vm = new IDidVerificationMethod(provider, wallet);
 
  // ⚠️ Ajusta estos valores

  const did = "did:isbe:bare-deploy-01:0ebc7a7ae898ed7b8021a11beaa550e12b694a51b0d9a2ace752495a3a502f78";

  const vMethodId = "vMethodId2";

  const publicKey =

    "0x04bdcb5b355723b01fc66dc75d7e42e20b572f8d13c3abd60a289932faa8f5c156106bacb05f8ac66b2d7853ccb23470c8d1adfd55cf15f892617b671469a89c7e"; 
    // clave pública en hex (uncompressed)

  const ellipticType = 1; // 1=k1, 2=r1

  const now = Math.floor(Date.now() / 1000);

  const notBefore = now;

  const notAfter = now + 365 * 24 * 60 * 60;
 
  console.log(chalk.blue(`RPC: ${process.env.RPC_URL}`));

  console.log(chalk.blue(`Usando cuenta firmante: ${wallet.address}`));
 
  // --- 1. addVerificationMethod ---

  try {

    console.log(chalk.yellow("Añadiendo verification method..."));

    const receipt = await vm.addVerificationMethod(

      did,

      vMethodId,

      publicKey,

      ellipticType

    );

    console.log(chalk.green("✔ addVerificationMethod tx:"), receipt.hash);

  } catch (err) {

    console.error(chalk.red("❌ Error en addVerificationMethod:"), err);

  }
  
  // --- 2. expireVerificationMethod ---

  try {

    console.log(chalk.yellow("Expirando verification method..."));

    const receipt = await vm.expireVerificationMethod(did, vMethodId, notAfter);

    console.log(chalk.green("✔ expireVerificationMethod tx:"), receipt.hash);

  } catch (err) {

    console.error(chalk.red("❌ Error en expireVerificationMethod:"), err);

  }
 
  // --- 3. revokeVerificationMethod ---

  try {

    console.log(chalk.yellow("Revocando verification method..."));

    const receipt = await vm.revokeVerificationMethod(did, vMethodId, notAfter);

    console.log(chalk.green("✔ revokeVerificationMethod tx:"), receipt.hash);

  } catch (err) {

    console.error(chalk.red("❌ Error en revokeVerificationMethod:"), err);

  }
 
  // --- 4. rollVerificationMethod ---

  try {

    console.log(chalk.yellow("Haciendo rollover de verification method..."));

    const rollArgs: RollArgs = {

      did,

      vMethodId: "vMethodId3",

      publicKey,

      ellipticType,

      notBefore,

      notAfter: notAfter + 1000,

      oldVMethodId: vMethodId,

      duration: 1000,

    };

    const receipt = await vm.rollVerificationMethod(rollArgs);

    console.log(chalk.green("✔ rollVerificationMethod tx:"), receipt.hash);

  } catch (err) {

    console.error(chalk.red("❌ Error en rollVerificationMethod:"), err);

  }

}
 
main().catch((err) => {

  console.error(chalk.red("Script error:"), err);

  process.exit(1);

});