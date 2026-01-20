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
import { JsonRpcProvider, Wallet, ethers } from "ethers";
import elliptic from "elliptic";
import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import bs58 from "bs58";
import { saveDID, readDIDs } from "../utils/localStorage";
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
  private ellipticTypeToJwkCrv(ellipticType: number): string {
    switch (ellipticType) {
      case 1:
        return "secp256k1";
      default:
        return "secp256k1";
    }
  }

  private publicKeyToJwk(pub: any): { kty: string; crv: string; x: string; y: string } {
    const xBuf = Buffer.from(pub.getX().toArrayLike(Buffer, "be", 32));
    const yBuf = Buffer.from(pub.getY().toArrayLike(Buffer, "be", 32));

    return {
      kty: "EC",
      crv: this.ellipticTypeToJwkCrv(this.ellipticType),
      x: xBuf.toString("base64url"),
      y: yBuf.toString("base64url"),
    };
  }

  async buildSignSend(rawTxApi: any, overrideSigner?: Wallet) {
  try {
    const signer = overrideSigner ?? this.wallet;

    const candidate = rawTxApi?.tx ?? rawTxApi;

    const from = await signer.getAddress();
    const network = await this.provider.getNetwork();
    const feeData = await this.provider.getFeeData();

    const maxFeePerGas = feeData.maxFeePerGas ?? 1_000_000_000n;
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 1_000_000_000n;

    if (typeof candidate === "string" && candidate.startsWith("0x")) {
      const parsed = ethers.Transaction.from(candidate);

      const to = parsed.to ?? undefined;
      const dataHex = ethers.hexlify(parsed.data ?? "0x");

      if (!to) throw new Error("RawTx inválida: falta 'to'.");
      if (!dataHex || dataHex === "0x") {
        throw new Error("RawTx inválida: falta calldata (data).");
      }

      const txReq: ethers.TransactionRequest = {
        to,
        data: dataHex,
        value: parsed.value ?? 0n,
        nonce: await this.provider.getTransactionCount(from, "pending"),
        chainId: Number(network.chainId),

        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      };

      txReq.gasLimit = await this.provider.estimateGas({
        from,
        to: txReq.to,
        data: txReq.data,
        value: txReq.value ?? 0n,
      });

      if (!txReq.data || txReq.data === "0x") {
        throw new Error("Protección: txReq quedó sin calldata. Abortando.");
      }

      const sent = await signer.sendTransaction(txReq);
      return await sent.wait();
    }

    if (candidate && typeof candidate === "object" && (candidate.to || candidate.data)) {
      const dataHex = ethers.hexlify(candidate.data ?? "0x");

      if (!dataHex || dataHex === "0x") {
        throw new Error("TxRequest inválida: falta calldata (data).");
      }

      const txReq: ethers.TransactionRequest = {
        ...candidate,
        from: undefined, 

        data: dataHex,

        nonce: await this.provider.getTransactionCount(from, "pending"),
        chainId: candidate.chainId ?? Number(network.chainId),

        type: 2,
        maxFeePerGas,
        maxPriorityFeePerGas,
      };

      if (!txReq.gasLimit) {
        txReq.gasLimit = await this.provider.estimateGas({
          from,
          to: txReq.to,
          data: txReq.data,
          value: txReq.value ?? 0n,
        });
      }

      if (!txReq.data || txReq.data === "0x") {
        throw new Error("Protección: txReq quedó sin calldata. Abortando.");
      }

      const sent = await signer.sendTransaction(txReq);
      return await sent.wait();
    }

    throw new Error("La API no devolvió tx válida (ni rawTx string ni txRequest object).");
  } catch (err: any) {
    console.error("Error en buildSignSend:", err?.response?.data || err?.message || err);
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

      if (!receipt) throw new Error("Tx no minada (wait() devolvió null)");

      if (receipt.status === 1) {
        console.log(chalk.green("Registro inicializado correctamente."));
        return;
      }
    } catch (e: any) {
    }
  }

  async createRoot(privKey: string, baseDocument: string, alsoKnownAs?: string) {
    try {
      console.log(chalk.cyan("\nCreando ROOT DID..."));

      let baseDoc = baseDocument;
      try {
        JSON.parse(baseDocument);
      } catch {
        throw new Error("El baseDocument no es un JSON válido. Pásalo entre comillas o usa --baseDocument '<json>'");

      }

      const key = this.ec.keyFromPrivate(privKey.replace(/^0x/, ""), "hex");
      const pubUncompressed = Buffer.from(key.getPublic().encode("hex", false), "hex");

      const msg = keccak_256(pubUncompressed.slice(1));
      const sig = key.sign(msg, { canonical: true });
      const r = sig.r.toArrayLike(Buffer, "be", 32);
      const s = sig.s.toArrayLike(Buffer, "be", 32);
      const v = (sig.recoveryParam ?? 0) + 27;

      const proofHex = "0x" + Buffer.concat([r, s, Uint8Array.from([v])]).toString("hex");

      const signatureDER = Buffer.from(sig.toDER());
      const last19 = signatureDER.slice(-19);

      const methodSpecific = "00" + last19.toString("hex");
      const did = `did:isbe:${this.NAMESPACE_ROOT}:${methodSpecific}`;
      const fragment = bs58.encode(Buffer.from(keccak_256(Buffer.from(did)).slice(0, 8)));

      const xBuf = Buffer.from(key.getPublic().getX().toArrayLike(Buffer, "be", 32));
      const yBuf = Buffer.from(key.getPublic().getY().toArrayLike(Buffer, "be", 32));

      const jwkObj = {
        kty: "EC",
        crv: "secp256k1",
        x: xBuf.toString("base64url"),
        y: yBuf.toString("base64url"),
      };

      const now = Math.floor(Date.now() / 1000);
      const oneYear = 365 * 86400;

      const payload = {
        did,
        baseDocument: baseDoc,
        vMethodId: fragment,
        proof: proofHex,
        publicKey: JSON.stringify(jwkObj),
        ellipticType: this.ellipticType,
        notBefore: now,
        notAfter: now + oneYear,
        alsoKnownAs: alsoKnownAs ? [alsoKnownAs] : [],
      };

      console.log(chalk.blue("\nPayload insertFirstDidDocument:"));
      console.log(JSON.stringify(payload, null, 2));

      const { data: raw } = await api.post("/insertFirstDidDocument", payload);
      await this.buildSignSend(raw.tx);

      console.log(chalk.green("\nRoot DID publicado (ON-CHAIN).\n"));

      const ownerAddr = await this.wallet.getAddress();
      return {
        did,
        owner: ownerAddr,
        publicKeyJwk: jwkObj,
        proofHex,
        createdAt: Date.now(),
      };
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

      const now = Math.floor(Date.now() / 1000);
      const oneYear = 365 * 24 * 60 * 60;

      const jwkObj = this.publicKeyToJwk(pub);

      const payload: any = {
          did,
          baseDocument,
          vMethodId: fragment,
          publicKey: JSON.stringify(jwkObj),
          publickKey: JSON.stringify(jwkObj),
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

      if (!rawTx || !rawTx.startsWith("0x")) {
        throw new Error("La API no devolvió una rawTx válida");
      }

      await this.buildSignSend(rawTx);

      console.log(chalk.green("\nDID secundario insertado correctamente.\n"));

      saveDID({
        did,
        type: "child",
        owner: await this.wallet.getAddress(),
        createdAt: Date.now(),
        baseDocument,
      });

      return {
        did,
        publicKeyJwk: jwkObj,
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

      console.log(chalk.green("Respuesta API /updateBaseDocument (rawTx):"));
      console.log(JSON.stringify(data, null, 2));

      const rawTx = typeof data === "string" ? data : data?.tx;

      if (!rawTx || typeof rawTx !== "string" || !rawTx.startsWith("0x")) {
        throw new Error("API /updateBaseDocument devolvió una rawTx inválida");
      }

      await this.buildSignSend(rawTx);

      console.log(
        chalk.green(
          "update-base finalizado (ON-CHAIN: transacción firmada y enviada)."
        )
      );
    } catch (err: any) {
      console.error(
        chalk.red("Error en updateBaseDocument (ON-CHAIN):"),
        err?.response?.data || err.message || err
      );
      throw err;
    }
  }

 
  async updateAlsoKnownAs(did: string, alsoKnownAs: string): Promise<void> {
    console.log(
      chalk.cyan("Actualizando alsoKnownAs:"),
      "\n  DID:", did,
      "\n  Nuevo alias:", alsoKnownAs,
      "\n"
    );

    try {
      const { data } = await api.post("/updateAlsoKnownAs", { did, alsoKnownAs: [alsoKnownAs] })

      console.log(chalk.green("Respuesta API /updateAlsoKnownAs:"));
      console.log(JSON.stringify(data, null, 2));
      const rawTx =
        (data && (data as any).tx) ||
        (typeof data === "string" ? data : undefined);

      if (!rawTx || typeof rawTx !== "string" || !rawTx.startsWith("0x")) {
        throw new Error("API /updateAlsoKnownAs devolvió una rawTx inválida");
      }

      await this.buildSignSend(rawTx);

      console.log(
        chalk.green("update-alias finalizado (ON-CHAIN: tx firmada y enviada).")
      );
    } catch (err: any) {
      console.error(
        chalk.red("Error actualizando alsoKnownAs ON-CHAIN:"),
        err?.response?.data || err?.message || err
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
 
  async getDidOnChain(did: string, accept?: string) {
    console.log(chalk.cyan(`Consultando DID on-chain: ${did}`));

    const { data } = await api.get("/getDidDocument", {
      params: { did },
      headers: accept ? { Accept: accept } : undefined,
    });

    console.log(JSON.stringify(data, null, 2));
    return data;
  }
 
  async getDidByTimestampOnChain(did: string, timestamp: number) {
    console.log(chalk.cyan(`Consultando versión histórica ON-CHAIN para ${did}`));

    const { data } = await api.get("/getDidDocumentByTimestamp", {
      params: { did, timestamp },
    });

    console.log(JSON.stringify(data, null, 2));
    return data;
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
 