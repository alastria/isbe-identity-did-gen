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
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  
* See the License for the specific language governing permissions and  
* limitations under the License.  
*/
import chalk from "chalk";
import { JsonRpcProvider, Wallet, ethers } from "ethers";
import IDidVerificationRelationship from "did-isbe-registry/dist/identity/did-isbe-lib/IDidVerificationRelationship.js";
 
export default class VerificationCLI {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private vrLib: IDidVerificationRelationship;
 
  constructor(provider: JsonRpcProvider, wallet: Wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.vrLib = new IDidVerificationRelationship(provider);
  }
 
  async addRelationship(
    did: string,
    name: string,
    vMethodId: string,
    notBefore?: number,
    notAfter?: number
  ) {
    console.log(chalk.blue(" Añadiendo Verification Relationship:"));
    console.log("   DID:", did);
    console.log("   name:", name);
    console.log("   vMethodId:", vMethodId);
 
    const now = Math.floor(Date.now() / 1000);
    const nb = notBefore ?? now;
    const na = notAfter ?? now + 365 * 24 * 3600;
 
    const rawTx = await this.vrLib.buildAddVerificationRelationshipTx(
      did,
      name,
      vMethodId,
      nb,
      na
    );
 
    const tx = ethers.Transaction.from(rawTx);
    tx.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
 
    const signed = await this.wallet.signTransaction(tx);
    const receipt = await this.vrLib.sendSignedTransaction(signed);
 
    console.log(chalk.green(`Verification Relationship añadida. Tx: ${receipt.hash}`));
    return receipt;
  }

  async listDidsByRelationship(
    vMethodId: string,
    name: string,
    page: number,
    pageSize: number
  ) {
    console.log(
      chalk.blue(
        `Listando DIDs por Verification Relationship (vMethodId=${vMethodId}, name=${name}) page=${page}, size=${pageSize}`
      )
    );
 
    if (page === 0) {
      console.log(chalk.yellow(" page=0 no es válido para esta librería → usando page=1"));
      page = 1;
    }
 
    const res = await this.vrLib.getDidsByVerificationRelationship(
      vMethodId,
      name,
      page,
      pageSize
    );
 
    console.log(chalk.green(" Consulta completada:"));
    console.log(JSON.stringify(res, null, 2));
 
    return res;
  }
}
