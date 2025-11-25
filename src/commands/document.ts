
import chalk from "chalk";
import { JsonRpcProvider, Wallet, TransactionReceipt, ethers } from "ethers";
import { IDidDocumentDetailed } from "did-isbe-registry";
import elliptic from "elliptic";
import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import bs58 from "bs58";
import { saveDID, readDIDs} from "../utils/localStorage";
import fs from "fs";
import path from "path";

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
    console.log(chalk.cyan("\nCreando Root DID..."));
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
      createdAt: Date.now(),
      alsoKnownAs: alsoKnownAs ?? "",
      version: 1,
      type: "root"
    });
  
    console.log(chalk.green(` Root DID creado off-chain: ${did}`));

    let baseDocObj;
    try {
      baseDocObj = JSON.parse(baseDocument);
    } catch (err) {
      console.error(chalk.red(" baseDocument no es JSON válido, no se puede publicar on-chain."));
      return did;
    }

    console.log(chalk.cyan("Publicando Root DID en blockchain..."));
    try {
      const receipt = await this.updateBaseDocument(did, baseDocObj);
      console.log(chalk.green(` Root DID publicado correctamente en blockchain`));
      console.log(`   Tx hash: ${receipt.hash}`);
    } catch (err: any) {
      console.error(chalk.red(" Error al publicar Root DID on-chain:"), err.message || err);
    }
    return did;
  } 

  async createChild(privKey: string, baseDocument: string, alsoKnownAs?: string): Promise<string> {
    console.log(chalk.cyan("\n Creando Child DID..."));
    const key = this.ec.keyFromPrivate(privKey.replace(/^0x/, ""), "hex");
    const pubUncompressed = Buffer.from(key.getPublic().encode("hex", false), "hex");
    const pubXY = pubUncompressed.slice(1);

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
      createdAt: Date.now(),
      alsoKnownAs: alsoKnownAs ?? "",
      version: 1,
      type: "child"
    });
  
    console.log(chalk.green(`Child DID creado off-chain: ${did}`));
  
    let baseDocObj;
    try {
      baseDocObj = JSON.parse(baseDocument);
    } catch (err) {
      console.error(chalk.red(" baseDocument no es JSON válido, no se puede publicar on-chain."));
      return did;
    }
  
    console.log(chalk.cyan(" Publicando Child DID en blockchain..."));
    try {
      const receipt = await this.updateBaseDocument(did, baseDocObj);
      console.log(chalk.green(` Child DID publicado correctamente en blockchain`));
      console.log(`   Tx hash: ${receipt.hash}`);
    } catch (err: any) {
      console.error(chalk.red("Error al publicar Child DID on-chain:"), err.message || err);
    }
  
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
 
  async updateAlsoKnownAs(did: string, newAlias: string) {
    console.log(chalk.cyan(`\nActualizando alias de ${did} → "${newAlias}"`));
    const entries = readDIDs();
    const found = entries.find(e => e.did === did);
  
    if (!found) {
      console.log(chalk.red(` DID ${did} no está en el storage local.`));
      return;
    }
    found.alsoKnownAs = newAlias;
    (found as any).updatedAt = Date.now();
     const STORAGE_FILE = path.join(__dirname, "../.dids.json");
  
    fs.writeFileSync(
      STORAGE_FILE,
      JSON.stringify(entries, null, 2),
      "utf8"
    );
  
    console.log(chalk.green(" Alias actualizado correctamente en storage local."));
  }
 
  async listAll(): Promise<DIDRecord[]> {
      const all = readDIDs();
      console.log(chalk.blueBright("DIDs encontrados:"));
      console.log(JSON.stringify(all, null, 2));
      return all;
  }

  async getDid(did: string): Promise<DIDRecord | null> {
      const all = readDIDs();
      const found = all.find(d => d.did === did);
      if (!found) {
        console.log(chalk.yellow(`DID ${did} no encontrado.`));
        return null;
      }
      console.log(chalk.blueBright(" DID encontrado:"));
      console.log(JSON.stringify(found, null, 2));
      return found;
  }
 
  async getDidByTimestamp(did: string, timestamp: number) {
    console.log(chalk.cyan(`\n Buscando DID histórico para ${did} @ ${timestamp}`));
    const tsMs = timestamp < 9999999999 ? timestamp * 1000 : timestamp;
  
    const all = readDIDs();
    const matches = all.filter(d => d.did === did);
  
    if (matches.length === 0) {
      console.log(chalk.red(`No existe el DID ${did} en el storage local.`));
      return;
    }
  
    const validVersions = matches.filter(d => d.createdAt <= tsMs);
  
    if (validVersions.length === 0) {
      console.log(chalk.yellow("No hay versiones anteriores a ese timestamp."));
      return;
    }
  
    const bestMatch = validVersions.reduce((prev, curr) =>
      curr.createdAt > prev.createdAt ? curr : prev
    );
  
    console.log(chalk.green("\n Documento histórico encontrado:\n"));
    console.log(JSON.stringify(bestMatch, null, 2));
    return bestMatch;
  }
 
}

 