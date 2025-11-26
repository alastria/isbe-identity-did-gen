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

import chalk from "chalk";
import { JsonRpcProvider, Wallet, ethers } from "ethers";
import IDidController from "did-isbe-registry/dist/identity/did-isbe-lib/IDidController.js";
import { findDID } from "../utils/localStorage.js";
import fs from "fs";

 
function isAddress(x: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(x);
}
 
function isDid(x: string) {
  return x.startsWith("did:isbe:");
}
 
function resolveDidToAddress(did: string): string | null {
  if (!isDid(did)) return null;
 
  const found = findDID(did);
 
  try {
    const rootFile = fs.readFileSync(".did_root", "utf8");
    const lines = rootFile.split("\n");
    const pkLine = lines.find(l => l.startsWith("PRIVATE_KEY="));
    const didLine = lines.find(l => l.startsWith("DID="));
 
    if (pkLine && didLine) {
      const rootDid = didLine.replace("DID=", "").trim();
 
      if (rootDid === did) {
        const privKey = pkLine.replace("PRIVATE_KEY=", "").trim();
        const wallet = new ethers.Wallet(privKey);
        return wallet.address;
      }
    }
  } catch (_) {
  }
 
  return null;
}
 

export default class DidControllerCLI {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private ctrlLib: IDidController;
 
  constructor(provider: JsonRpcProvider, wallet: Wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.ctrlLib = new IDidController(provider);
  }
 

  normalizeControllerInput(input: string): { did?: string; address: string } {
    if (isAddress(input)) {
      return { address: input };
    }
 
    if (isDid(input)) {
      const addr = resolveDidToAddress(input);
      if (!addr) {
        throw new Error(
          `No pude resolver la address del DID ${input}. ¿Existe en .dids.json o .did_root?`
        );
      }
      return { did: input, address: addr };
    }
 
    throw new Error(`Formato inválido de controller: ${input}`);
  }
  
  async addController(targetDid: string, controllerInput: string) {
    console.log(
      chalk.blue(`Añadiendo controller:`),
      `\n   Controller: ${controllerInput}`,
      `\n   Target DID: ${targetDid}\n`
    );
 
    const { did: controllerDid } = this.normalizeControllerInput(controllerInput);
 
    if (!controllerDid) {
      throw new Error(`add-controller SOLO acepta DID como controller`);
    }
 
    const rawTx = await this.ctrlLib.buildAddControllerTx(
      targetDid,
      controllerDid
    );
 
    const tx = ethers.Transaction.from(rawTx);
    tx.nonce = await this.provider.getTransactionCount(
      this.wallet.address,
      "pending"
    );
 
    const signed = await this.wallet.signTransaction(tx);
    const receipt = await this.ctrlLib.sendSignedTransaction(signed);
 
    console.log(
      chalk.green(`Controller añadido. Tx: ${receipt.hash}`)
    );
  }
 
 
  async revokeController(targetDid: string, controllerInput: string) {
    console.log(
      chalk.yellow(`Revocando controller:`),
      `\n   Controller: ${controllerInput}`,
      `\n   Target DID: ${targetDid}\n`
    );
 
    const { did: controllerDid } = this.normalizeControllerInput(controllerInput);
 
    if (!controllerDid)
      throw new Error(`revoke-controller SOLO acepta DID como controller`);
 
    const rawTx = await this.ctrlLib.buildRevokeControllerTx(
      targetDid,
      controllerDid
    );
 
    const tx = ethers.Transaction.from(rawTx);
    tx.nonce = await this.provider.getTransactionCount(
      this.wallet.address,
      "pending"
    );
 
    const signed = await this.wallet.signTransaction(tx);
    const receipt = await this.ctrlLib.sendSignedTransaction(signed);
 
    console.log(
      chalk.green(` Controller revocado. Tx: ${receipt.hash}`)
    );
  }
 
 
  async check(targetDid: string, controllerInput: string) {
    console.log(
      chalk.blue(` Verificando controller:`),
      `\n   Controller: ${controllerInput}`,
      `\n   Target DID: ${targetDid}\n`
    );
 
    const { address } = this.normalizeControllerInput(controllerInput);
 
    const result = await this.ctrlLib.checkController(targetDid, address);
    console.log(chalk.green(`Resultado: ${result}`));
 
    return result;
  }
  
  async listByController(controllerInput: string, page: number, pageSize: number) {
    console.log(
      chalk.blue(
        `Listando DIDs controlados por ${controllerInput} (page=${page}, size=${pageSize})…`
      )
    );
 
    const { did: controllerDid } = this.normalizeControllerInput(controllerInput);
    if (!controllerDid)
      throw new Error(`list-dids-by-controller SOLO acepta DID como controller`);
 
    const res = await this.ctrlLib.getDidsByController(
      controllerDid,
      page,
      pageSize
    );
 
    console.log(chalk.green("Consulta completada:"));
    console.log(JSON.stringify(res, null, 2));
 
    return res;
  }
}