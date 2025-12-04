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
import elliptic from "elliptic";
import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import bs58 from "bs58";
import { saveDID, readDIDs, updateDIDAliasLocal, updateDIDBaseLocal } from "../utils/localStorage";
import type { DIDEntry as DIDRecord } from "../utils/localStorage"; 
 
import { api } from "../api/client";
import {
  ellipticTypeToCurveName,
  saveEllipticType,
} from "../utils/curveConfi";

export default class DidCommands {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private ec: elliptic.ec;
  private ellipticType: number;
  private readonly NAMESPACE_ROOT = "root";
  private readonly NAMESPACE_CHILD = "usecase-demo-01";

  constructor(
    provider: JsonRpcProvider,
    wallet: Wallet,
    _rpcUrl: string,
    ellipticType: number = 1
  ) {
    this.provider = provider;
    this.wallet = wallet;
    this.ellipticType = ellipticType;
    const curveName = ellipticTypeToCurveName(ellipticType);
    this.ec = new elliptic.ec(curveName);
    console.log(
      `DidCommands inicializado con curva ${curveName} (ellipticType=${ellipticType})`
    );
  }
 
  private async sendTransaction(tx: any): Promise<TransactionReceipt> {
    console.log(chalk.cyan("Preparando envío de transacción..."));
    try {
      const txResp = await this.wallet.sendTransaction(tx);
      console.log(chalk.gray(`Tx hash: ${txResp.hash}`));
      const receipt = await txResp.wait();
      console.log(
        chalk.green(`Confirmada en bloque ${receipt.blockNumber}`)
      );
      return receipt;
    } catch (err: any) {
      console.error(
        chalk.red("Error al enviar transacción:"),
        err.message || err
      );
      throw err;
    }
  }
 
  private selfSignForChild(key: elliptic.ec.KeyPair) {
    const pubUncompressed = Buffer.from(
      key.getPublic().encode("hex", false),
      "hex"
    );
    const pubXY = pubUncompressed.slice(1);
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
 
  async buildSignSend(rawTxApi: any, overrideSigner?: Wallet) {
    try {
      console.log(" Preparando transacción desde rawTx API...");
 
      const raw = rawTxApi?.tx ?? rawTxApi;
      if (!raw) {
        throw new Error("La API no devolvió ninguna transacción (rawTx vacío)");
      }
      const signer = overrideSigner ?? this.wallet;
      if (typeof raw === "string" && raw.startsWith("0x")) {
        console.log(
          " rawTx recibido como string hex. Primeros 80 chars:",
          raw.slice(0, 80)
        );
 
        let unsigned: ethers.Transaction;
        try {
          unsigned = ethers.Transaction.from(raw);
        } catch (e) {
          throw new Error(
            "No pude parsear el rawTx string devuelto por la API con ethers.Transaction.from"
          );
        }
 
        unsigned.nonce = await this.provider.getTransactionCount(
          await signer.getAddress(),
          "pending"
        );
 
        const signed = await signer.signTransaction(unsigned);
 
        console.log("Enviando transacción firmada a la API (/sendSignedTransaction)...");
        const { data } = await api.post("/sendSignedTransaction", {
          rawTx: signed,
        });
 
        return data;
      }
 
      if (typeof raw === "object") {
        console.log(
          " rawTx recibido como objeto unsignedTx. Preview:",
          JSON.stringify(raw).slice(0, 200)
        );
 
        const unsigned: any = { ...raw };
 
        if (unsigned.nonce === undefined) {
          unsigned.nonce = await this.provider.getTransactionCount(
            await signer.getAddress(),
            "pending"
          );
        }
 
        const signed = await signer.signTransaction(unsigned);
 
        console.log("Enviando a /sendSignedTransaction ...");
        const { data } = await api.post("/sendSignedTransaction", {
          rawTx: signed,
        });
 
        return data;
      }
 
      throw new Error(
        `Formato de rawTx desconocido (tipo=${typeof raw}). Esperaba string '0x...' u objeto unsignedTx.`
      );
    } catch (err) {
      console.error("Error en buildSignSend:", err);
      throw err;
    }
  }

  async init(ellipticType: number) {
    console.log(chalk.cyan("Inicializando Registry vía API..."));
    const modelDeployId = process.env.MODEL_DEPLOY_ID;
    const didRegistryAddress = process.env.DID_REGISTRY_ADDRESS;
    const rpcUrl = process.env.RPC_URL;
    if (!modelDeployId || !didRegistryAddress || !rpcUrl) {
      console.error("ERROR: faltan variables .env", {
        modelDeployId,
        didRegistryAddress,
        rpcUrl,
      });
      return;
    }
    saveEllipticType(ellipticType);
    const curveName = ellipticTypeToCurveName(ellipticType);
    this.ec = new elliptic.ec(curveName);
    console.log(chalk.blue(`Curva seleccionada: ${curveName}`));
    await api.post("/updateConfig", {
      modelDeployId,
      didRegistryAddress,
      rpcUrl,
    });
    console.log(chalk.green(" Config cargada en API"));
    console.log(chalk.cyan(" Solicitando rawTx init..."));
    const { data: rawInit } = await api.post("/initializeDiDRegistry", {
      ellipticType,
    });
    if (!rawInit.tx) {
      console.error("La API no devolvió tx");
      return;
    }

    await this.buildSignSend(rawInit);
    console.log(chalk.green(" Registro DID inicializado"));
  }

  async createRoot(
    privKey: string,
    baseDocument: string,
    alsoKnownAs?: string
  ) {
    console.log(chalk.cyan("\nCreando ROOT DID vía API + blockchain..."));
    let baseDoc = baseDocument;
    try {
      JSON.parse(baseDocument);
    } catch {
      baseDoc = JSON.stringify({ raw: baseDocument });
    }
    const key = this.ec.keyFromPrivate(privKey.replace(/^0x/, ""), "hex");
    const pubUncompressed = Buffer.from(
      key.getPublic().encode("hex", false),
      "hex"
    );
    const msg = keccak_256(pubUncompressed.slice(1));
    const sig = key.sign(msg, { canonical: true });
    const r = sig.r.toArrayLike(Buffer, "be", 32);
    const s = sig.s.toArrayLike(Buffer, "be", 32);
    const v = (sig.recoveryParam ?? 0) + 27;
    const proofHex =
      "0x" + Buffer.concat([r, s, Uint8Array.from([v])]).toString("hex");
    const signatureDER = Buffer.from(sig.toDER());
    const last19 = signatureDER.slice(-19);
    const methodSpecific = "00" + last19.toString("hex");
    const did = `did:isbe:${this.NAMESPACE_ROOT}:${methodSpecific}`;
    const fragment = bs58.encode(
      Buffer.from(keccak_256(Buffer.from(did)).slice(0, 8))
    );

    const xBuf = Buffer.from(
      key.getPublic().getX().toArrayLike(Buffer, "be", 32)
    );

    const yBuf = Buffer.from(
      key.getPublic().getY().toArrayLike(Buffer, "be", 32)
    );

    const jwk = JSON.stringify({
      kty: "EC",
      crv: "secp256k1",
      x: xBuf.toString("base64url"),
      y: yBuf.toString("base64url"),
    });
    saveDID({
      did,
      baseDocument: baseDoc,
      fragment,
      publicKeyHex: "0x" + pubUncompressed.toString("hex"),
      alsoKnownAs: alsoKnownAs ?? "",
      type: "root",
      version: 1,
      createdAt: Date.now(),
    });
 
    console.log(chalk.green(`Root DID off-chain: ${did}`));
    const now = Math.floor(Date.now() / 1000);
    const oneYear = 365 * 86400; 
    const { data: raw } = await api.post("/insertFirstDidDocument", {
      did,
      baseDocument: baseDoc,
      vMethodId: fragment,
      proof: proofHex,
      publicKey: jwk,
      ellipticType: this.ellipticType,
      notBefore: now,
      notAfter: now + oneYear,
      alsoKnownAs: alsoKnownAs ? [alsoKnownAs] : [],
    });
 
    const receipt = await this.buildSignSend(raw.tx);
    console.log(
      chalk.green(
        `Root DID publicado on-chain. Tx: ${
          (receipt as any)?.hash ||
          (receipt as any)?.transactionHash ||
          "undefined"
        }`
      )
    );
    return did;
  }


  async createChild(
    privKeyHex: string,
    baseDocument: string,
    aka?: string
  ): Promise<string> {
    console.log(chalk.blueBright("Creando DID secundario (via API)…"));

    const priv = privKeyHex.startsWith("0x") ? privKeyHex : "0x" + privKeyHex;
    const key = this.ec.keyFromPrivate(priv.replace(/^0x/, ""), "hex");
    const pub = key.getPublic();
    const x = pub.getX().toString("hex").padStart(64, "0");
    const y = pub.getY().toString("hex").padStart(64, "0");
    const pubHexXY = "0x" + x + y;
    const { signatureDER } = this.selfSignForChild(key);
    const did = this.buildDIDFromSignature(signatureDER);
    console.log("DID secundario generado:", chalk.yellow(did));
    const fragment = this.fragmentFromDid(did);
    const rootWalletAddress = await this.wallet.getAddress();
    console.log(
      chalk.green(
        `ROOT controller (wallet) que se usará como emisor del child: ${rootWalletAddress}`
      )
    );
    const now = Math.floor(Date.now() / 1000);
    const oneYear = 365 * 24 * 60 * 60;
    try {
      const payload: any = {
        did,
        baseDocument,
        vMethodId: fragment,
        publickKey: pubHexXY, 
        ellipticType: this.ellipticType,
        notBefore: now,
        notAfter: now + oneYear,
      };
      if (aka) {
        payload.alsoKnownAs = [aka];
      }
      const { data } = await api.post("/insertDidDocument", payload); 
      console.log("Respuesta API /insertDidDocument:", data);
      let rawTx: string | undefined;
      if (typeof data === "string") {
        rawTx = data;
      } else if (data?.rawTx && typeof data.rawTx === "string") {
        rawTx = data.rawTx;
      } else if (data?.tx && typeof data.tx === "string") {
        rawTx = data.tx;
      }
      if (!rawTx || !rawTx.startsWith("0x")) {
        console.error("Respuesta inesperada de /insertDidDocument:", data);
        throw new Error(
          "La API /insertDidDocument no devolvió una rawTx válida (string 0x...)"
        );
      }
      console.log("Preparando transacción desde rawTx API...");
      console.log(
        "rawTx recibido como string hex. Primeros 80 chars:",
        rawTx.slice(0, 80)
      );
      const receipt = await this.buildSignSend(rawTx);
      console.log(
        chalk.green(
          `DID secundario insertado en blockchain. Tx: ${
            (receipt as any)?.hash ||
            (receipt as any)?.transactionHash ||
            "(hash no disponible)"
          }`
        )
      );
    } catch (err: any) {
      console.error(
        chalk.red("Error al insertar DID secundario vía API:"),
        err?.response?.data || err
      );
      throw err;
    }
    saveDID({
      did,
      baseDocument,
      fragment,
      publicKeyHex: pubHexXY,
      controller: rootWalletAddress,
      createdAt: Date.now(),
      alsoKnownAs: aka ?? "",
      type: "child",
      version: 1,
    } as any);
    console.log(chalk.green("Almacenado en storage local (.dids.json)"));
    const pubUncompressedHex = "0x04" + x + y;
    console.log("\nClave pública del CHILD DID:");
    console.log("  • Uncompressed (para add-vm, roll-vm):");
    console.log("    ", pubUncompressedHex);
    console.log("  • XY (para insertDidDocument):");
    console.log("    ", pubHexXY);
    console.log();
    return did;
}
 
  async updateBaseDocument(did: string, baseDocument: any) {
    console.log(chalk.cyan(`Actualizando baseDocument de ${did} vía API...`));
    const baseStr =
      typeof baseDocument === "string"
        ? baseDocument
        : JSON.stringify(baseDocument);
    try {
      const { data } = await api.post("/updateBaseDocument", {
        did,
        baseDocument: baseStr,
      });
      console.log(chalk.green("Respuesta API /updateBaseDocument:"));
      console.log(JSON.stringify(data, null, 2));
    } catch (err: any) {
      console.error(
        chalk.red("Error en updateBaseDocument (API):"),
        err?.response?.data || err.message || err
      );
    }
    try {
      updateDIDBaseLocal(did, baseStr);
    } catch (e) {
      console.error(
        chalk.red("Error actualizando baseDocument en storage local:"),
        e
      );
    }
    console.log(
      chalk.green("update-base finalizado (OFF-CHAIN: storage local actualizado).")
    );
  }
 
  async updateAlsoKnownAs(did: string, alsoKnownAs: string): Promise<void> {
    console.log(
      chalk.cyan("Actualizando alsoKnownAs:"),
      "\n  DID:", did,
      "\n  Nuevo alias:", alsoKnownAs,
      "\n"
    );
    try {
      const { data } = await api.post("/updateAlsoKnownAs", {
        did,
        alsoKnownAs: [alsoKnownAs], 
      });
 
      console.log(chalk.green("Respuesta API /updateAlsoKnownAs:"));
      console.log(JSON.stringify(data, null, 2));
    } catch (err: any) {
      console.error(chalk.red("Error actualizando alsoKnownAs ON-CHAIN"));
      console.error(err?.response?.data || err?.message || err);
      throw err;
    }

    try {
      updateDIDAliasLocal(did, alsoKnownAs);
    } catch (err) {
      console.error(
        chalk.red("Error actualizando alias en storage local (.dids.json):"),
        err
      );

    }
 
    console.log(chalk.green("update-alias finalizado (on-chain + off-chain)."));
  }
 
  async getDidByTimestampOnChain(
    did: string,
    timestamp: number,
    format: "hex" | "jwk" = "hex"
  ) {
    console.log(
      chalk.cyan(
        "\n Consultando DID histórico ON-CHAIN vía API:"
      )
    );
    console.log("DID:", did);
    console.log("Timestamp:", timestamp);
    console.log("Formato:", format);
    try {
      const { data } = await api.get("/getDidDocumentByTimestamp", {
        params: { did, timestamp, formato: format },
      });
       console.log(
        chalk.green(" Documento histórico encontrado ON-CHAIN:\n")
      );
      console.log(JSON.stringify(data, null, 2));
      return data;
    } catch (err: any) {
      console.error(
        chalk.red(" Error en getDidByTimestampOnChain (API):"),
        err?.response?.data || err
      );
      throw err;
    }
  }
 
  async listAll(): Promise<DIDRecord[]> {
    const all = readDIDs();
    console.log(chalk.blueBright("DIDs encontrados en storage local:"));
    console.log(JSON.stringify(all, null, 2));
    return all;
  }
 
  async getDidOnChain(did: string, format: "hex" | "jwk" = "hex") {
    console.log(
      chalk.cyan(`Consultando DID on-chain vía API: ${did}`)
    );
    try {
      const { data } = await api.get("/getDidDocument", {
        params: { did, formato: format },
      });
      if (!data) {
        console.log(
          chalk.red(" DID no encontrado en blockchain (API)")
        );
        return null;
      }
      console.log("Documento on-chain encontrado:");
      console.log(JSON.stringify(data, null, 2));
      return data;
    } catch (err: any) {
      console.error(
        chalk.red(" Error consultando DID on-chain (API):"),
        err?.response?.data || err
      );
      throw err;
    }
  }
 
  async getDidByTimestamp(did: string, timestamp: number) {
    console.log(
      chalk.cyan(
        `\nBuscando DID histórico LOCAL para ${did} @ ${timestamp}`
      )
    );
    const tsMs = timestamp < 9999999999 ? timestamp * 1000 : timestamp;
    const all = readDIDs();
    const matches = all.filter((d) => d.did === did);
    if (matches.length === 0) {
      console.log(
        chalk.red(`No existe el DID ${did} en el storage local.`)
      );
      return;
    }

    const validVersions = matches.filter((d) => d.createdAt <= tsMs);
    if (validVersions.length === 0) {
      console.log(
        chalk.yellow(
          "No hay versiones anteriores a ese timestamp en local."
        )
      );
      return;
    }
    const bestMatch = validVersions.reduce((prev, curr) =>
      curr.createdAt > prev.createdAt ? curr : prev
    );
    console.log(chalk.green("\nDocumento histórico LOCAL encontrado:\n"));
    console.log(JSON.stringify(bestMatch, null, 2));
    return bestMatch;
  }
 
  async listOnChainDIDs(page: number = 1, pageSize: number = 10) {
    console.log(
      chalk.blue(
        ` Consultando DIDs on-chain vía API (page=${page}, pageSize=${pageSize})`
      )
    );
    try {
      const { data } = await api.get("/getDids", {
        params: { page, pageSize },
      });
      console.log(
        chalk.green(" DIDs encontrados en blockchain (API):")
      );
      console.log(JSON.stringify(data, null, 2));
      return data;
    } catch (e: any) {
      console.error(
        chalk.red(" Error obteniendo DIDs on-chain vía API:"),
        e?.response?.data || e
      );
      throw e;
    }
  }
}
 