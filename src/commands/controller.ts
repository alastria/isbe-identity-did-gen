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
import IDidController from "../../../../libs/did-isbe-lib/identity/didregistry/IDidController";

 export default class DidControllerCLI {
  provider: JsonRpcProvider;
  wallet: Wallet;
  didCtrl: IDidController;
 
  constructor() {
    this.provider = new JsonRpcProvider(process.env.RPC_URL!);
    this.wallet = new Wallet(process.env.ACCOUNT_PRIVATE_KEY!, this.provider);
    this.didCtrl = new IDidController(this.provider, this.wallet);
 
    console.log(chalk.blue(`RPC: ${process.env.RPC_URL}`));
    console.log(chalk.blue(`Usando cuenta firmante: ${this.wallet.address}`));
  }
 
  async addController(did: string, controllerDid: string) {
    console.log(chalk.yellow(`Añadiendo controller ${controllerDid} al DID ${did}`));
    const receipt = await this.didCtrl.addController(did, controllerDid);
    console.log(chalk.green("addController tx:"), receipt.hash);
    return receipt;
  }
 
  async revokeController(did: string, controllerDid: string) {
    console.log(chalk.yellow(`Revocando controller ${controllerDid} del DID ${did}`));
    const receipt = await this.didCtrl.revokeController(did, controllerDid);
    console.log(chalk.green("revokeController tx:"), receipt.hash);
    return receipt;
  }
 
  async checkController(did: string, controllerAddr: string) {
    console.log(chalk.yellow(`Comprobando controller ${controllerAddr} del DID ${did}`));
    const resString = await this.didCtrl.checkController(did, controllerAddr);
    const resBytes = await this.didCtrl.checkControllerBytes(ethers.toUtf8Bytes(did), controllerAddr);
    console.log(`checkController(string) → ${resString}`);
    console.log(`checkController(bytes) → ${resBytes}`);
    return { resString, resBytes };
  }
 
  async getDidsByController(controllerDid: string, page = 1, pageSize = 10) {
    console.log(chalk.yellow(`Consultando DIDs por controller ${controllerDid}`));
    const res = await this.didCtrl.getDidsByController(controllerDid, page, pageSize);
    console.log("getDidsByController →", res);
    return res;
  }
}

export async function addControllerCLI(did: string, controllerDid: string) {
  const cli = new DidControllerCLI();
  return cli.addController(did, controllerDid);
}
 
export async function revokeControllerCLI(did: string, controllerDid: string) {
  const cli = new DidControllerCLI();
  return cli.revokeController(did, controllerDid);
}
 
export async function checkControllerCLI(did: string, controllerAddr: string) {
  const cli = new DidControllerCLI();
  return cli.checkController(did, controllerAddr);
}
 
export async function listDidsByControllerCLI(controllerDid: string, page?: number, pageSize?: number) {
  const cli = new DidControllerCLI();
  return cli.getDidsByController(controllerDid, page, pageSize);
}