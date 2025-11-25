
import chalk from "chalk";
import { JsonRpcProvider, Wallet, TransactionReceipt, ethers } from "ethers";
import { IDidDocumentDetailed } from "did-isbe-registry";
import elliptic from "elliptic";
import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import bs58 from "bs58";
import { saveDID } from "../utils/localStorage";

 
export default class DidCommands {
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
 
  private normalizeTime(timestamp?: number) {
    return timestamp ?? Math.floor(Date.now() / 1000);
  }
 
  private selfSign(privHex: string) {
    const key = this.ec.keyFromPrivate(privHex.replace(/^0x/, ""), "hex");
    const pubUncompressed = Buffer.from(key.getPublic().encode("hex", false), "hex");
    const pubXY = pubUncompressed.slice(1);
    const msg = keccak_256(pubXY);
    const sig = key.sign(msg, { canonical: true });
    const r = sig.r.toArrayLike(Buffer, "be", 32);
    const s = sig.s.toArrayLike(Buffer, "be", 32);
    const v = (sig.recoveryParam ?? 0) + 27;
    const proof = Buffer.concat([r, s, Buffer.from([v])]);
    return { proof, key, signatureDER: Buffer.from(sig.toDER()) };
  }
 
  private buildDID(signatureDER: Buffer, modelId: string) {
    const last19 = signatureDER.slice(-19);
    const versionByte = Buffer.from([0x00]);
    const methodBytes = Buffer.concat([versionByte, last19]);
    return `did:isbe:${modelId}:${methodBytes.toString("hex")}`;
  }
 
  async init(ellipticType: number) {
    console.log(chalk.cyan("Inicializando DID Registry..."));
    try {
      const rawTx = await this.didLib.buildInitializeDiDRegistryTx(ellipticType);
      const parsed = ethers.Transaction.from(rawTx);

      const txRequest = {
        to: parsed.to,
        data: parsed.data,
        gasLimit: parsed.gasLimit ?? 1500000n,
        value: parsed.value ?? 0n,
        gasPrice: parsed.gasPrice ?? (await this.provider.getFeeData()).gasPrice,
        nonce: await this.wallet.getNonce(),
        chainId: (await this.provider.getNetwork()).chainId,
      };
      await this.sendTransaction(txRequest);
      console.log(chalk.green("Registro DID inicializado correctamente."));
    } catch (err: any) {
      if (err.message?.includes("Already initialized")) {
        console.log(chalk.yellow("El contrato ya estaba inicializado."));
      } else {
        console.error(chalk.red("Error al inicializar el registro:"), err);
      }
    }
  }

  async createRoot(privKey: string, baseDocument: string, alsoKnownAs?: string): Promise<string> {
    const key = this.ec.keyFromPrivate(privKey.replace(/^0x/, ""), "hex");
    const pubUncompressed = Buffer.from(key.getPublic().encode("hex", false), "hex");
    const pubXY = pubUncompressed.slice(1);
    const sig = key.sign(keccak_256(pubXY), { canonical: true });
    const r = sig.r.toArrayLike(Buffer, "be", 32);
    const s = sig.s.toArrayLike(Buffer, "be", 32);
    const v = (sig.recoveryParam ?? 0) + 27;
    const proof = Buffer.concat([r, s, Buffer.from([v])]);
 
    const didBytes = Buffer.concat([Buffer.from([0x00]), proof.slice(-19)]);
    const did = `did:isbe:${this.NAMESPACE_ROOT}:${didBytes.toString("hex")}`;
    const fragment = bs58.encode(Buffer.from(keccak_256(Buffer.from(did)).slice(0, 8)));
    const publicKeyHex = "0x" + key.getPublic().encode("hex", false);
 
    saveDID({
      did,
      baseDocument,
      fragment,
      publicKeyHex,
      version: 1,
      createdAt: Date.now(),
      alsoKnownAs: alsoKnownAs ?? "",
      type: "root"
    });
 
    console.log(chalk.green(`Root DID creado: ${did}`));
    return did;
  }
 

  async createChild(privKey: string, baseDocument: string, alsoKnownAs?: string): Promise<string> {
    const key = this.ec.keyFromPrivate(privKey.replace(/^0x/, ""), "hex");
    const pubUncompressed = Buffer.from(key.getPublic().encode("hex", false), "hex");    const pubXY = pubUncompressed.slice(1);
    const sig = key.sign(keccak_256(pubXY), { canonical: true });
    const r = sig.r.toArrayLike(Buffer, "be", 32);
    const s = sig.s.toArrayLike(Buffer, "be", 32);
    const v = (sig.recoveryParam ?? 0) + 27;
    const proof = Buffer.concat([r, s, Buffer.from([v])]);
  
    const didBytes = Buffer.concat([Buffer.from([0x00]), proof.slice(-19)]);
    const did = `did:isbe:${this.NAMESPACE_CHILD}:${didBytes.toString("hex")}`;
    const fragment = bs58.encode(Buffer.from(keccak_256(Buffer.from(did)).slice(0, 8)));
    const publicKeyHex = "0x" + key.getPublic().encode("hex", false);
  
    saveDID({
      did,
      baseDocument,
      fragment,
      publicKeyHex,
      version: 1,
      createdAt: Date.now(),
      alsoKnownAs: alsoKnownAs ?? "",
      type: "child"
    });
  
    console.log(chalk.green(`Child DID creado: ${did}`));
    return did;
  }

  async updateBaseDocument(did: string, baseDocument: any) {
    try {
      console.log(`Actualizando baseDocument de ${did}`);
      const baseDocumentStr = JSON.stringify(baseDocument);
      const tx = await this.didLib.buildUpdateBaseDocumentTx(
        did,
        baseDocumentStr
      );
      const txRequest: ethers.TransactionRequest = {
        to: tx.to,
        data: tx.data,
        gasLimit: tx.gasLimit,
        value: tx.value,
      };
      const sent = await this.wallet.sendTransaction(txRequest);
      console.log(" TX enviada:", sent.hash);
      const receipt = await sent.wait();
      console.log("BaseDocument actualizado");
      return receipt;
      } catch (err) {
        console.error("Error en updateBaseDocument:", err);
      throw err;
    }
}
 



  async listAll(): Promise<DIDRecord[]> {
      const all = loadDIDs();
      console.log(chalk.blueBright("DIDs encontrados:"));
      console.log(JSON.stringify(all, null, 2));
      return all;
  }

 
  async getDid(did: string): Promise<DIDRecord | null> {
      const all = loadDIDs();
      const found = all.find(d => d.did === did);
      if (!found) {
        console.log(chalk.yellow(`DID ${did} no encontrado.`));
        return null;
      }
      console.log(chalk.blueBright(" DID encontrado:"));
      console.log(JSON.stringify(found, null, 2));
      return found;
  }
 
 
  async getDidByTimestamp(did: string, timestamp: number, format: "hex" | "jwk" = "hex") {
    console.log(chalk.blueBright(`Obteniendo DID histórico: ${did} @ ${timestamp}`));
    console.log(chalk.green(await this.didLib.getDidDocumentByTimestamp(did, timestamp, format)));
  }
}

 