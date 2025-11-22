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

import { JsonRpcProvider, Wallet } from "ethers";
import chalk from "chalk";
import IDidVerificationMethod, { RollArgs } from "../../../../libs/did-isbe-lib/identity/didregistry/IDidVerificationMethod";
 
export default class DidVerificationMethodCLI {
  private vm: IDidVerificationMethod;
 
  constructor(rpcUrl: string, privateKey: string) {
    const provider = new JsonRpcProvider(rpcUrl);
 
    const wallet = new Wallet(privateKey, provider);
 
    this.vm = new IDidVerificationMethod(wallet);
  }
 
  private async handleTx(promise: Promise<any>, label: string) {
    try {
      const tx = await promise;
 
      if (tx && typeof tx === "object" && "hash" in tx) {
        console.log(chalk.green(`${label} tx:`), tx.hash);
      } else {
        console.log(
          chalk.yellow(`${label}: no se devolvió transacción (posible revert o llamada view)`)
        );
        console.log(chalk.gray("Valor devuelto:"), tx);
      }
      return tx;
    } catch (err: any) {
      console.error(chalk.red(`${label} error:`), err);
      if (err?.error?.data) {
        console.log(chalk.magenta("EVM revert data:"), err.error.data);
      }
      return null;
    }
  }
 
  async add(did: string, vMethodId: string, publicKey: string, ellipticType: number) {
    console.log(chalk.yellow("Añadiendo verification method..."));
    return this.handleTx(
      this.vm.addVerificationMethod(did, vMethodId, publicKey, ellipticType),
      "addVerificationMethod"
    );
  }
 
  async expire(did: string, vMethodId: string, notAfter: number) {
    console.log(chalk.yellow("Expirando verification method..."));
    return this.handleTx(
      this.vm.expireVerificationMethod(did, vMethodId, notAfter),
      "expireVerificationMethod"
    );
  }
 
  async revoke(did: string, vMethodId: string, notAfter: number) {
    console.log(chalk.yellow("Revocando verification method..."));
    return this.handleTx(
      this.vm.revokeVerificationMethod(did, vMethodId, notAfter),
      "revokeVerificationMethod"
    );
  }
 
  async roll(args: RollArgs) {
    console.log(chalk.yellow("Haciendo rollover de verification method..."));
    return this.handleTx(
      this.vm.rollVerificationMethod(args),
      "rollVerificationMethod"
    );
  }
}