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

import { JsonRpcProvider, Wallet } from "ethers";
import chalk from "chalk";
import IDidVerificationRelationship from "../../../../libs/did-isbe-lib/identity/didregistry/IDidVerificationRelationship";
export default class DidVerificationRelationshipCLI {
 private rel: IDidVerificationRelationship;
 constructor() {
   const provider = new JsonRpcProvider(process.env.RPC_URL!);
   const wallet = new Wallet(process.env.ACCOUNT_PRIVATE_KEY!, provider);
   this.rel = new IDidVerificationRelationship(provider, wallet);
   console.log(chalk.blue(`RPC: ${process.env.RPC_URL}`));
   console.log(chalk.blue(`Usando cuenta firmante: ${wallet.address}`));
 }
 async add(did: string, name: string, vMethodId: string, notBefore: number, notAfter: number) {
   try {
     console.log(chalk.yellow(`Añadiendo relación ${name} para DID ${did} con vMethodId ${vMethodId}`));
     const receipt = await this.rel.addVerificationRelationship(did, name, vMethodId, notBefore, notAfter);
     console.log(chalk.green("addVerificationRelationship tx:"), receipt.hash);
   } catch (err) {
     console.error(chalk.red("Error en addVerificationRelationship:"), err);
   }
 }
 async list(vMethodId: string, name: string, page: number, pageSize: number) {
   try {
     console.log(chalk.yellow(`Consultando DIDs por relación ${name} con vMethodId ${vMethodId}`));
     const res = await this.rel.getDidsByVerificationRelationship(vMethodId, name, page, pageSize);
     console.log("getDidsByVerificationRelationship →");
     console.log(`  - total: ${res.total}`);
     console.log(`  - howMany: ${res.howMany}`);
     console.log(`  - prev: ${res.prev}`);
     console.log(`  - next: ${res.next}`);
     console.log("  - items:");
     for (const item of res.items) {
       console.log(`    DID: ${item.did}, notBefore: ${item.notBefore}, notAfter: ${item.notAfter}`);
     }
   } catch (err) {
     console.error(chalk.red("Error en getDidsByVerificationRelationship:"), err);
   }
 }
}
