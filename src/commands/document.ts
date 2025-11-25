
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
  private readonly ellipticType = 1;

  private selfSignForChild(key: elliptic.ec.KeyPair) {
  const pubUncompressed = Buffer.from(key.getPublic().encode("hex", false), "hex");
  const pubXY = pubUncompressed.slice(1); // quitar 0x04
 
  const msg = keccak_256(pubXY);
  const sig = key.sign(msg, { canonical: true });
 
  const r = sig.r.toArrayLike(Buffer, "be", 32);
  const s = sig.s.toArrayLike(Buffer, "be", 32);
  const v = (sig.recoveryParam ?? 0) + 27;
 
  const proof = ethers.concat([r, s, Uint8Array.from([v])]);
  const signatureDER = Buffer.from(sig.toDER());
 
  return { proof, signatureDER };
}

 
private buildDIDFromSignature(signatureDER: Buffer) {
  const last19 = signatureDER.slice(-19);
  const versionByte = Buffer.from([0x00]);
 
  const methodBytes = Buffer.concat([versionByte, last19]);
  const methodSpecificId = methodBytes.toString("hex");
 
  return `did:isbe:${this.NAMESPACE_CHILD}:${methodSpecificId}`;
}

 
private fragmentFromDid(did: string) {
  return bs58.encode(Buffer.from(keccak_256(Buffer.from(did)).slice(0, 8)));
}

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
 
  console.log(chalk.cyan("\nCreando Root DID (on-chain)…"));
 
  // 1) Key y pública XY

  const key = this.ec.keyFromPrivate(privKey.replace(/^0x/, ""), "hex");

  const pub = key.getPublic();

  const pubXY = Buffer.from(pub.encode("hex", false), "hex").slice(1);
 
  // 2) Self-sign

  const msg = keccak_256(pubXY);

  const sig = key.sign(msg, { canonical: true });
 
  const r = sig.r.toArrayLike(Buffer, "be", 32);

  const s = sig.s.toArrayLike(Buffer, "be", 32);

  const v = (sig.recoveryParam ?? 0) + 27;

  const proof = ethers.concat([r, s, Uint8Array.from([v])]);
 
  // 3) DID desde Signature DER

  const signatureDER = Buffer.from(sig.toDER());

  const last19 = signatureDER.slice(-19);

  const did = `did:isbe:${this.NAMESPACE_ROOT}:00${last19.toString("hex")}`;
 
  // 4) Fragment

  const fragment = bs58.encode(Buffer.from(keccak_256(Buffer.from(did)).slice(0, 8)));
 
  // 5) JWK desde la clave pública

  const x = Buffer.from(pub.getX().toArrayLike(Buffer, "be", 32)).toString("base64url");

  const y = Buffer.from(pub.getY().toArrayLike(Buffer, "be", 32)).toString("base64url");
 
  const jwk = JSON.stringify({

    kty: "EC",

    crv: "secp256k1",

    x,

    y

  });
 
  // 6) Cache OFF-CHAIN

  saveDID({

    did,

    baseDocument,

    fragment,

    publicKeyHex: "0x" + pub.encode("hex", false),

    createdAt: Date.now(),

    alsoKnownAs: alsoKnownAs ?? "",

    type: "root",

    version: 1

  });
 
  console.log(chalk.green(` Root DID creado off-chain: ${did}`));
 
  // 7) Publicación ON-CHAIN

  const now = Math.floor(Date.now() / 1000);

  const oneYear = 365 * 24 * 3600;
 
  const rawTx = await this.didLib.buildInsertFirstDidDocumentTx(

    did,

    baseDocument,

    fragment,

    proof,

    jwk,            // <<=== AQUÍ VA LA JWK!!!  (no baseDocument)

    1,              // secp256k1

    now,

    now + oneYear,

    alsoKnownAs ?? ""

  );
 
  const tx = ethers.Transaction.from(rawTx);

  tx.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
 
  const signed = await this.wallet.signTransaction(tx);

  const receipt = await this.didLib.sendSignedTransaction(signed);
 
  console.log(chalk.green(` Root DID publicado en blockchain. Tx: ${receipt.hash}`));
  const pubUncompressedHex = "0x" + pub.encode("hex", false); // 0x04...
  const xHex = pub.getX().toString("hex").padStart(64, "0");
  const yHex = pub.getY().toString("hex").padStart(64, "0");
  const pubXYHex = "0x" + xHex + yHex;
  
  console.log("\n🔑 Clave pública del ROOT DID:");
  console.log("  • Uncompressed (para add-vm, roll-vm):");
  console.log("    ", pubUncompressedHex);
  console.log("  • XY (para operations de insert):");
  console.log("    ", pubXYHex);
  console.log();
  return did;

}


  async createChild(privKeyHex: string, baseDocument: string, aka?: string): Promise<string> {
    console.log(chalk.blueBright("Creando DID secundario (on-chain)…"));
 
    // 1) Normalizar clave privada del CHILD (la que representará al DID)
    const priv = privKeyHex.startsWith("0x") ? privKeyHex : "0x" + privKeyHex;
 
    const ec = new elliptic.ec("secp256k1");
    const key = ec.keyFromPrivate(priv.replace(/^0x/, ""), "hex");
 
    // 2) Derivar pública en formato XY (64 bytes, sin 0x04)
    const pub = key.getPublic();
    const x = pub.getX().toString("hex").padStart(64, "0");
    const y = pub.getY().toString("hex").padStart(64, "0");
    const pubHexXY = "0x" + x + y;
 
    // 3) Firmar para derivar DID (self-sign)
    const sig = this.selfSignForChild(key);
    const did = this.buildDIDFromSignature(sig.signatureDER);
    console.log("DID secundario generado:", chalk.yellow(did));
 
    // 4) Fragmento del método
    const fragment = this.fragmentFromDid(did);
 
    // 5) Fechas on-chain
    const now = Math.floor(Date.now() / 1000);
    const oneYear = 365 * 24 * 60 * 60;
 
    // 6) Construimos la TX on-chain usando la LIB
    const rawTx = await this.didLib.buildInsertDidDocumentTx(
      did,
      baseDocument,
      fragment,
      pubHexXY,            // pública en XY
      this.ellipticType,   // 👈 ahora SÍ está definido (1)
      now,
      now + oneYear
    );
 
    // 7) Parsear y ajustar NONCE, firmar con la ROOT (this.wallet)
    const tx = ethers.Transaction.from(rawTx);
    tx.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
 
    const signedTx = await this.wallet.signTransaction(tx);
    const receipt = await this.didLib.sendSignedTransaction(signedTx);
 
    console.log(chalk.green(`✔ DID secundario insertado en blockchain. Tx: ${receipt.hash}`));
 
    // 8) Guardar en storage local (.dids.json)
    saveDID({
      did,
      baseDocument,
      fragment,
      publicKeyHex: pubHexXY,
      createdAt: Date.now(),
      alsoKnownAs: aka ?? "",
      type: "child",
      version: 1
    });
 
    console.log(chalk.green("✔ Almacenado en storage local (.dids.json)"));
    const pubUncompressedHex = "0x04" + x + y; // fácil: solo prepender 04
 
    console.log("\n🔑 Clave pública del CHILD DID:");
    console.log("  • Uncompressed (para add-vm, roll-vm):");
    console.log("    ", pubUncompressedHex);
    console.log("  • XY (para insertDidDocument):");
    console.log("    ", pubHexXY);
    console.log();
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

  async getDidOnChain(did: string) {
    console.log(chalk.cyan(`Consultando DID on-chain: ${did}`));
  
    const doc = await this.didLib.getDidDocument(did);
  
    if (!doc) {
      console.log(chalk.red("❌ DID no encontrado en blockchain"));
      return null;
    }
  
    console.log(chalk.green("✔ Documento on-chain encontrado:"));
    console.log(JSON.stringify(doc, null, 2));
  
    return doc;
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

 