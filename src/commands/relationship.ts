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
import chalk from "chalk";
import { JsonRpcProvider, Wallet, TransactionReceipt, ethers } from "ethers";
import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import bs58 from "bs58";
import IDidVerificationMethod from "did-isbe-registry/dist/identity/did-isbe-lib/IDidVerificationMethod.js";
 
export default class DidRelationship {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private vmLib: IDidVerificationMethod;
  constructor(provider: JsonRpcProvider, wallet: Wallet, rpcUrl: string) {
    this.provider = provider;
    this.wallet = wallet;
    this.vmLib = new IDidVerificationMethod(provider);
    this.vmLib.configManager.updateConfig({
      didRegistryAddress: process.env.DID_REGISTRY_ADDRESS,
    });
    this.vmLib.contract = this.vmLib.configManager.getContract();
     console.log(
      "DID Registry en DidRelationship.contract:",
      (this.vmLib.contract as any).target ?? this.vmLib.contract.address
    );
  }
 
  private async sendTxRequest(
    txReq: ethers.TransactionRequest
  ): Promise<TransactionReceipt> {
    const request: ethers.TransactionRequest = {
      ...txReq,
      gasLimit: txReq.gasLimit ?? 1_500_000n,
      gasPrice:
        txReq.gasPrice ?? (await this.provider.getFeeData()).gasPrice ?? 0n,
      nonce: txReq.nonce ?? (await this.wallet.getNonce()),
      chainId: txReq.chainId ?? (await this.provider.getNetwork()).chainId,
    };
    const sent = await this.wallet.sendTransaction(request);
    console.log("Tx enviada:", sent.hash);
    const receipt = await sent.wait();
    console.log("Confirmada en bloque", receipt.blockNumber);
    return receipt;
  }
 
  private generateFragment(did: string): string {
    const hash = keccak_256(Buffer.from(did + Date.now().toString()));
    return bs58.encode(Buffer.from(hash.slice(0, 8)));
  }
 
  private buildVMethodId(did: string, fragment: string) {
    return `${did}#${fragment}`;
  }
 
  async addVerificationMethod(
    did: string,
    publicKeyHex: string,
    ellipticType: number = 1
  ) {
    console.log(chalk.blueBright(`Añadiendo verificationMethod a ${did}`));
    try {
      const fragment = this.generateFragment(did);
      const vMethodId = this.buildVMethodId(did, fragment);
      const txReq = (await this.vmLib.buildAddVerificationMethodTx(
        did,
        vMethodId,
        publicKeyHex,
        ellipticType
      )) as ethers.TransactionRequest;
      if (!txReq.data) {
        console.log(
          chalk.red(
            "buildAddVerificationMethodTx devolvió una tx"
          )
        );
      } 
      const receipt = await this.sendTxRequest(txReq); 
      console.log(chalk.green("✔ Verification method añadido correctamente"));
      console.log("Tx:", receipt.hash);
      console.log("Fragment generado:", fragment);
    } catch (err: any) {
      console.error(
        chalk.red("Error añadiendo verificationMethod:"),
        err.message || err
      );
      throw err;
    }
  }
 
  async revokeVerificationMethod(
    did: string,
    fragment: string,
    notAfter: number = Math.floor(Date.now() / 1000)
  ) {
    console.log(chalk.blue(`Revocando ${fragment} en ${did}`)); 
    const vMethodId = this.buildVMethodId(did, fragment); 
    const txReq = (await this.vmLib.buildRevokeVerificationMethodTx(
      did,
      vMethodId,
      notAfter
    )) as ethers.TransactionRequest;
    const receipt = await this.sendTxRequest(txReq);
    console.log(chalk.green(` Revocado on-chain. Tx: ${receipt.hash}`));
  }
 
  async expireVerificationMethod(
    did: string,
    fragment: string,
    newNotAfter: number
  ) {
    console.log(
      chalk.blue(`Expirando verificationMethod ${fragment} en ${did}`)
    );
    const vMethodId = this.buildVMethodId(did, fragment);
    const txReq = (await this.vmLib.buildExpireVerificationMethodTx(
      did,
      vMethodId,
      newNotAfter
    )) as ethers.TransactionRequest;
    const receipt = await this.sendTxRequest(txReq);
    console.log(chalk.green(`Expirado on-chain. Tx: ${receipt.hash}`));
  }
 
  async rollVerificationMethod(
    did: string,
    oldFragment: string,
    newPublicKeyHex: string,
    ellipticType = 1,
    duration = 365 * 24 * 60 * 60
  ) {
    console.log(
      chalk.blue(`Rotando verificationMethod ${oldFragment} en ${did}`)
    );
    const now = Math.floor(Date.now() / 1000);
    const newFragment = this.generateFragment(did);
    const oldVMethodId = this.buildVMethodId(did, oldFragment);
    const newVMethodId = this.buildVMethodId(did, newFragment);
     const args = {
      did,
      vMethodId: newVMethodId,
      publicKey: newPublicKeyHex,
      ellipticType,
      notBefore: now,
      notAfter: now + duration,
      oldVMethodId,
      duration,
    };
 
    const txReq = (await this.vmLib.buildRollVerificationMethodTx(
      args
    )) as ethers.TransactionRequest; 
    const receipt = await this.sendTxRequest(txReq);
    console.log(chalk.green(`Rotado on-chain. Tx: ${receipt.hash}`));
    console.log("Nuevo fragment:", newFragment);
    return newFragment;
  }
}

 