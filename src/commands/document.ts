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
 
  private fragmentFromDid(did: string) {
    return bs58.encode(Buffer.from(keccak_256(Buffer.from(did)).slice(0, 8)));
  }

  async buildSignSend(rawTxApi: any, overrideSigner?: Wallet) {
    try {
      console.log("Preparando transacción desde rawTx API...");

      const raw = rawTxApi?.tx ?? rawTxApi;
      if (!raw || typeof raw !== "string" || !raw.startsWith("0x")) {
        throw new Error("La API no devolvió rawTx válido");
      }

      const signer = overrideSigner ?? this.wallet;
      const from = await signer.getAddress();
      const tx = ethers.Transaction.from(raw);

      tx.nonce = await this.provider.getTransactionCount(from, "pending");
      const signedTx = await signer.signTransaction(tx);

      console.log(" Enviando transacción firmada a /sendSignedTransaction...");

      const { data } = await api.post("/sendSignedTransaction", {
        rawTx: signedTx,
      });
      console.log("Transacción enviada correctamente");
      return data;

    } catch (err: any) {
      console.error(" Error en buildSignSend:", err?.response?.data || err?.message || err);
      throw err;
    }
  }

  async init(ellipticType: number) {
    console.log(chalk.cyan("Iniciando registro DID..."));

    const { MODEL_DEPLOY_ID, DID_REGISTRY_ADDRESS, RPC_URL } = process.env;
    if (!MODEL_DEPLOY_ID || !DID_REGISTRY_ADDRESS || !RPC_URL) {
      console.error("Error: faltan variables en .env");
      return;
    }
    try {
      const iface = new ethers.Interface([
        "function initializeDiDRegistry(uint8 ellipticType)"
      ]);

      const calldata = iface.encodeFunctionData("initializeDiDRegistry", [ellipticType]);

      const tx = await this.wallet.sendTransaction({
        to: DID_REGISTRY_ADDRESS,
        data: calldata,
        gasLimit: 3_000_000n
      });

      const receipt = await tx.wait();

      if (receipt.status === 1n) {
        console.log(chalk.green("Registro inicializado correctamente."));
        return;
      }
    } catch (e: any) {
    }

    try {
      saveEllipticType(ellipticType);
      this.ec = new elliptic.ec(ellipticTypeToCurveName(ellipticType));
      await api.post("/updateConfig", {
        modelDeployId: MODEL_DEPLOY_ID,
        didRegistryAddress: DID_REGISTRY_ADDRESS,
        rpcUrl: RPC_URL
      });
      const { data: rawInit } = await api.post("/initializeDiDRegistry", {
        ellipticType
      });

      const rawTx = rawInit?.tx ?? rawInit;

      if (!rawTx || typeof rawTx !== "string") {
        console.error("Error: API devolvió una transacción inválida");
        return;
      }

      await this.buildSignSend(rawTx);

      console.log(chalk.green("Registro inicializado correctamente."));
      
    } catch (err: any) {
      const msg = err?.message || "Error desconocido";
      console.error(`Error inicializando registro: ${msg}`);
    }
  }

  async createRoot(
    privKey: string,
    baseDocument: string,
    alsoKnownAs?: string
  ) {
    try {
      console.log(chalk.cyan("\nCreando ROOT DID..."));
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
      const now = Math.floor(Date.now() / 1000);
      const oneYear = 365 * 86400;
      const payload = {
        did,
        baseDocument: baseDoc,
        vMethodId: fragment,
        proof: proofHex,
        publicKey: jwk,
        ellipticType: this.ellipticType,
        notBefore: now,
        notAfter: now + oneYear,
        alsoKnownAs: alsoKnownAs ? [alsoKnownAs] : [],
      };

      console.log(chalk.blue("\nPayload insertFirstDidDocument:"));
      console.log(JSON.stringify(payload, null, 2));
      const { data: raw } = await api.post("/insertFirstDidDocument", payload);

      await this.buildSignSend(raw.tx);

      console.log(chalk.green("\nRoot DID publicado.\n"));
      const result = {
        did,
        publicKeyHex: "0x" + pubUncompressed.toString("hex"),
        proofHex,
      };

      return result;

    } catch (err: any) {
      console.error("Error creando ROOT DID:", err?.message || err);
      throw err;
    }
  }

  async createChild(
    privKeyHex: string,
    baseDocument: string,
    aka?: string
  ) {
    try {
      console.log(chalk.blueBright("\nCreando DID secundario...\n"));
      const priv = privKeyHex.startsWith("0x") ? privKeyHex : "0x" + privKeyHex;
      const key = this.ec.keyFromPrivate(priv.replace(/^0x/, ""), "hex");

      const pub = key.getPublic();
      const x = pub.getX().toString("hex").padStart(64, "0");
      const y = pub.getY().toString("hex").padStart(64, "0");

      const pubXY = "0x" + x + y;
      const pubUncompressedHex = "0x04" + x + y;

      const pubXYbuf = Buffer.concat([Buffer.from(x, "hex"), Buffer.from(y, "hex")]);
      const msg = keccak_256(pubXYbuf);
      const sig = key.sign(msg, { canonical: true });

      const r = sig.r.toArrayLike(Buffer, "be", 32);
      const s = sig.s.toArrayLike(Buffer, "be", 32);
      const v = (sig.recoveryParam ?? 0) + 27;
      const proofHex =
        "0x" + Buffer.concat([r, s, Uint8Array.from([v])]).toString("hex");

      const signatureDER = Buffer.from(sig.toDER());
      const last19 = signatureDER.slice(-19);
      const methodSpecific = "00" + last19.toString("hex");
      const did = `did:isbe:${this.NAMESPACE_CHILD}:${methodSpecific}`;

      console.log(chalk.yellow("DID secundario generado:"));
      console.log(" →", did, "\n");

      const fragment = this.fragmentFromDid(did);
      const controller = await this.wallet.getAddress();

      const now = Math.floor(Date.now() / 1000);
      const oneYear = 365 * 24 * 60 * 60;

      const payload: any = {
        did,
        baseDocument,
        vMethodId: fragment,
        publickKey: pubXY,
        ellipticType: this.ellipticType,
        notBefore: now,
        notAfter: now + oneYear,
      };

      if (aka) payload.alsoKnownAs = [aka];

      console.log(chalk.blue("Payload insertDidDocument:\n"));
      console.log(JSON.stringify(payload, null, 2));

      const { data } = await api.post("/insertDidDocument", payload);

      const rawTx =
        data?.rawTx ??
        data?.tx ??
        (typeof data === "string" ? data : undefined);

      if (!rawTx || !rawTx.startsWith("0x"))
        throw new Error("La API no devolvió una rawTx válida");

      await this.buildSignSend(rawTx);

      console.log(chalk.green("\nDID secundario insertado correctamente.\n"));

      return {
        did,
        publicKeyHex: pubUncompressedHex,
        proofHex,
      };

    } catch (err: any) {
      console.error(
        chalk.red("Error creando DID secundario:"),
        err?.response?.data || err?.message || err
      );
      throw err;
    }
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
 