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
import { JsonRpcProvider, Wallet, TransactionReceipt, ethers } from "ethers";
import { IDidDocumentDetailed } from "did-isbe-registry";
import elliptic from "elliptic";
import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import bs58 from "bs58";
import { saveDID } from "../utils/localStorage";

 
export default class DidRelationship {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private didLib: IDidDocumentDetailed;
  private ec = new elliptic.ec("secp256k1");
  private readonly NAMESPACE_ROOT = "root";
  private readonly NAMESPACE_CHILD = "usecase-demo-01";
 
  constructor(provider: JsonRpcProvider, wallet: Wallet, rpcUrl: string) {
    this.provider = provider;
    this.wallet = wallet;
    this.didLib = new IDidDocumentDetailed(rpcUrl);
    this.didLib.configManager.updateConfig({
      didRegistryAddress: process.env.DID_REGISTRY_ADDRESS
    });
    this.didLib.contract = this.didLib.configManager.getContract(); 
    console.log("DID Registry final en didLib.contract:", this.didLib.contract.target);
  }
 
  private async sendTransaction(tx: any): Promise<TransactionReceipt> {
    console.log(chalk.cyan("Preparando envío de transacción..."));
    try {
      const txResp = await this.wallet.sendTransaction(tx);
      console.log(chalk.gray(`Tx hash: ${txResp.hash}`));
      const receipt = await txResp.wait();
      console.log(chalk.green(`Confirmada en bloque ${receipt.blockNumber}`));
      return receipt;
    } catch (err: any) {
      console.error(chalk.red("Error al enviar transacción:"), err.message || err);
      throw err;
    }
  }
 



async revokeVerificationMethod(did: string, fragment: string) {
  console.log(chalk.blueBright(`Revocando verification method ${fragment} en ${did} (on-chain)`));
  try {
    if (typeof (this.didLib as any).buildRevokeVerificationMethodTx === "function") {
      const tx = await (this.didLib as any).buildRevokeVerificationMethodTx(did, fragment);
      await this.sendTransaction(tx);
    } else {
      const didBytes = (this.didLib as any).didToBytes32 ? (this.didLib as any).didToBytes32(did) : undefined;
      const fragBytes32 = (this.didLib as any).fragmentToBytes32 ? (this.didLib as any).fragmentToBytes32(fragment) : undefined;
      if (!didBytes || !fragBytes32) {
        throw new Error("No se puede resolver didBytes/fragmentBytes32 para revoke; la librería no tiene los helpers requeridos.");
      }
      const data = this.didLib.contract.interface.encodeFunctionData("revokeVerificationMethod", [didBytes, fragBytes32]);
      const txReq: any = {
        to: await this.didLib.contract.getAddress(),
        data,
        gasLimit: 1500000,
        nonce: await this.provider.getTransactionCount(this.wallet.address, "pending"),
      };
      await this.sendTransaction(txReq);
    }
 
    console.log(chalk.green("Verification method revocado on-chain."));
 
    try {
      const entry = findDID(did);
      if (entry && (entry as any).vMethods) {
        const vMethods = (entry as any).vMethods.map((vm: any) =>
          vm.fragment === fragment ? { ...vm, revoked: true, revokedAt: new Date().toISOString() } : vm
        );
        updateDID(did, { ...(entry as any), vMethods });
        console.log(chalk.green("Store local actualizado (revocado)."));
      }
    } catch (e: any) {
      console.log(chalk.yellow("No se pudo actualizar store local al revocar vMethod:"), e.message);
    }
  } catch (e: any) {
    console.error(chalk.red("Error al revocar verification method:"), e.message || e);
    throw e;
  }
}
async addVerificationMethod(did: string, publicKeyHex: string, name = "vMethod", notBefore?: number, notAfter?: number) {
  console.log(chalk.blueBright(`Añadiendo verification method a ${did} (on-chain)`));
  try {
    const fragment = bs58.encode(Buffer.from(keccak_256(Buffer.from(did + Date.now().toString())).slice(0, 8)));
    const nb = notBefore ?? this.normalizeTime();
    const na = notAfter ?? (nb + 365 * 24 * 60 * 60);
    const baseDoc = "{}";
    const rawTx = await this.didLib.buildInsertDidDocumentTx(
      did,
      baseDoc,
      fragment,
      publicKeyHex,
      1, 
      nb,
      na
    );
 
    const tx = ethers.Transaction.from(rawTx);
    tx.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
    const signed = await this.wallet.signTransaction(tx);
    await this.didLib.sendSignedTransaction(signed);
 
    console.log(chalk.green("Verification method añadido on-chain."));
 
    try {
      const entry = findDID(did);
      if (entry) {
        const current = { ...(entry as any) };
        const vMethods = current.vMethods || [];
        vMethods.push({
          name,
          fragment,
          publicKeyHex,
          notBefore: new Date(nb * 1000).toISOString(),
          notAfter: new Date(na * 1000).toISOString(),
        });
        updateDID(did, { ...(current), vMethods });
      } else {
        const newEntry: DIDEntry = {
          did,
          baseDocument: baseDoc,
          fragment,
          publicKeyHex,
          version: 1,
          createdAt: new Date().toISOString(),
          type: "child",
          aka: "",
        };
        saveDID(newEntry);
      }
      console.log(chalk.green("Store local actualizado con verification method."));
    } catch (e: any) {
      console.log(chalk.yellow("No se pudo actualizar store local con vMethod:"), e.message);
    }
  } catch (e: any) {
    console.error(chalk.red("Error al añadir verification method:"), e.message || e);
    throw e;
  }
}
}