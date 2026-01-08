"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const chalk_1 = __importDefault(require("chalk"));
const ethers_1 = require("ethers");
const elliptic_1 = __importDefault(require("elliptic"));
const sha3_1 = require("@noble/hashes/sha3");
const node_buffer_1 = require("node:buffer");
const bs58_1 = __importDefault(require("bs58"));
const localStorage_1 = require("../utils/localStorage");
const client_1 = require("../api/client");
const curveConfi_1 = require("../utils/curveConfi");
class DidCommands {
    constructor(provider, wallet, _rpcUrl, ellipticType = 1) {
        this.NAMESPACE_ROOT = "root";
        this.NAMESPACE_CHILD = "usecase-demo-01";
        this.provider = provider;
        this.wallet = wallet;
        this.ellipticType = ellipticType;
        const curveName = (0, curveConfi_1.ellipticTypeToCurveName)(ellipticType);
        this.ec = new elliptic_1.default.ec(curveName);
        console.log(`DidCommands inicializado con curva ${curveName} (ellipticType=${ellipticType})`);
    }
    fragmentFromDid(did) {
        return bs58_1.default.encode(node_buffer_1.Buffer.from((0, sha3_1.keccak_256)(node_buffer_1.Buffer.from(did)).slice(0, 8)));
    }
    ellipticTypeToJwkCrv(ellipticType) {
        switch (ellipticType) {
            case 1:
                return "secp256k1";
            default:
                return "secp256k1";
        }
    }
    publicKeyToJwk(pub) {
        const xBuf = node_buffer_1.Buffer.from(pub.getX().toArrayLike(node_buffer_1.Buffer, "be", 32));
        const yBuf = node_buffer_1.Buffer.from(pub.getY().toArrayLike(node_buffer_1.Buffer, "be", 32));
        const jwkObj = {
            kty: "EC",
            crv: this.ellipticTypeToJwkCrv(this.ellipticType),
            x: xBuf.toString("base64url"),
            y: yBuf.toString("base64url"),
        };
        return JSON.stringify(jwkObj);
    }
    async buildSignSend(rawTxApi, overrideSigner) {
        try {
            const signer = overrideSigner ?? this.wallet;
            // La API a veces manda { tx: "0x..." } o { tx: {...} } o directamente "0x..."
            const candidate = rawTxApi?.tx ?? rawTxApi;
            const from = await signer.getAddress();
            const network = await this.provider.getNetwork();
            const feeData = await this.provider.getFeeData();
            const maxFeePerGas = feeData.maxFeePerGas ?? 1000000000n;
            const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 1000000000n;
            // =========================
            // 1) Candidate es RAW TX string
            // =========================
            if (typeof candidate === "string" && candidate.startsWith("0x")) {
                const parsed = ethers_1.ethers.Transaction.from(candidate);
                const to = parsed.to ?? undefined;
                const dataHex = ethers_1.ethers.hexlify(parsed.data ?? "0x");
                if (!to)
                    throw new Error("RawTx inválida: falta 'to'.");
                if (!dataHex || dataHex === "0x") {
                    throw new Error("RawTx inválida: falta calldata (data).");
                }
                const txReq = {
                    to,
                    data: dataHex,
                    value: parsed.value ?? 0n,
                    // ✅ usa siempre el nonce actual del signer (evita NONCE_EXPIRED)
                    nonce: await this.provider.getTransactionCount(from, "pending"),
                    chainId: Number(network.chainId),
                    // ✅ usa EIP-1559 estable
                    type: 2,
                    maxFeePerGas,
                    maxPriorityFeePerGas,
                };
                // gasLimit: estima si no viene
                txReq.gasLimit = await this.provider.estimateGas({
                    from,
                    to: txReq.to,
                    data: txReq.data,
                    value: txReq.value ?? 0n,
                });
                // ✅ Bloqueo total: nunca enviar sin data
                if (!txReq.data || txReq.data === "0x") {
                    throw new Error("Protección: txReq quedó sin calldata. Abortando.");
                }
                const sent = await signer.sendTransaction(txReq);
                return await sent.wait();
            }
            // =========================
            // 2) Candidate es un txRequest object
            // =========================
            if (candidate && typeof candidate === "object" && (candidate.to || candidate.data)) {
                const dataHex = ethers_1.ethers.hexlify(candidate.data ?? "0x");
                if (!dataHex || dataHex === "0x") {
                    throw new Error("TxRequest inválida: falta calldata (data).");
                }
                const txReq = {
                    ...candidate,
                    from: undefined, // ethers lo calcula del signer
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
        }
        catch (err) {
            console.error("Error en buildSignSend:", err?.response?.data || err?.message || err);
            throw err;
        }
    }
    async init(ellipticType) {
        console.log(chalk_1.default.cyan("Iniciando registro DID..."));
        const { MODEL_DEPLOY_ID, DID_REGISTRY_ADDRESS, RPC_URL } = process.env;
        if (!MODEL_DEPLOY_ID || !DID_REGISTRY_ADDRESS || !RPC_URL) {
            console.error("Error: faltan variables en .env");
            return;
        }
        try {
            const iface = new ethers_1.ethers.Interface([
                "function initializeDiDRegistry(uint8 ellipticType)"
            ]);
            const calldata = iface.encodeFunctionData("initializeDiDRegistry", [ellipticType]);
            const tx = await this.wallet.sendTransaction({
                to: DID_REGISTRY_ADDRESS,
                data: calldata,
                gasLimit: 3000000n
            });
            const receipt = await tx.wait();
            if (!receipt)
                throw new Error("Tx no minada (wait() devolvió null)");
            if (receipt.status === 1) {
                console.log(chalk_1.default.green("Registro inicializado correctamente."));
                return;
            }
        }
        catch (e) {
        }
    }
    async createRoot(privKey, baseDocument, alsoKnownAs) {
        try {
            console.log(chalk_1.default.cyan("\nCreando ROOT DID..."));
            let baseDoc = baseDocument;
            try {
                JSON.parse(baseDocument);
            }
            catch {
                throw new Error("El baseDocument no es un JSON válido. Pásalo entre comillas o usa --baseDocument '<json>'");
            }
            const key = this.ec.keyFromPrivate(privKey.replace(/^0x/, ""), "hex");
            const pubUncompressed = node_buffer_1.Buffer.from(key.getPublic().encode("hex", false), "hex");
            const msg = (0, sha3_1.keccak_256)(pubUncompressed.slice(1));
            const sig = key.sign(msg, { canonical: true });
            const r = sig.r.toArrayLike(node_buffer_1.Buffer, "be", 32);
            const s = sig.s.toArrayLike(node_buffer_1.Buffer, "be", 32);
            const v = (sig.recoveryParam ?? 0) + 27;
            const proofHex = "0x" + node_buffer_1.Buffer.concat([r, s, Uint8Array.from([v])]).toString("hex");
            const signatureDER = node_buffer_1.Buffer.from(sig.toDER());
            const last19 = signatureDER.slice(-19);
            const methodSpecific = "00" + last19.toString("hex");
            const did = `did:isbe:${this.NAMESPACE_ROOT}:${methodSpecific}`;
            const fragment = bs58_1.default.encode(node_buffer_1.Buffer.from((0, sha3_1.keccak_256)(node_buffer_1.Buffer.from(did)).slice(0, 8)));
            const xBuf = node_buffer_1.Buffer.from(key.getPublic().getX().toArrayLike(node_buffer_1.Buffer, "be", 32));
            const yBuf = node_buffer_1.Buffer.from(key.getPublic().getY().toArrayLike(node_buffer_1.Buffer, "be", 32));
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
            console.log(chalk_1.default.blue("\nPayload insertFirstDidDocument:"));
            console.log(JSON.stringify(payload, null, 2));
            const { data: raw } = await client_1.api.post("/insertFirstDidDocument", payload);
            await this.buildSignSend(raw.tx);
            console.log(chalk_1.default.green("\nRoot DID publicado (ON-CHAIN).\n"));
            const ownerAddr = await this.wallet.getAddress();
            return {
                did,
                owner: ownerAddr,
                publicKeyHex: "0x" + pubUncompressed.toString("hex"),
                proofHex,
                createdAt: Date.now(),
            };
        }
        catch (err) {
            console.error("Error creando ROOT DID:", err?.message || err);
            throw err;
        }
    }
    async createChild(privKeyHex, baseDocument, aka) {
        try {
            console.log(chalk_1.default.blueBright("\nCreando DID secundario...\n"));
            const priv = privKeyHex.startsWith("0x") ? privKeyHex : "0x" + privKeyHex;
            const key = this.ec.keyFromPrivate(priv.replace(/^0x/, ""), "hex");
            const pub = key.getPublic();
            const x = pub.getX().toString("hex").padStart(64, "0");
            const y = pub.getY().toString("hex").padStart(64, "0");
            const pubUncompressedHex = "0x04" + x + y;
            const pubXYbuf = node_buffer_1.Buffer.concat([node_buffer_1.Buffer.from(x, "hex"), node_buffer_1.Buffer.from(y, "hex")]);
            const msg = (0, sha3_1.keccak_256)(pubXYbuf);
            const sig = key.sign(msg, { canonical: true });
            const r = sig.r.toArrayLike(node_buffer_1.Buffer, "be", 32);
            const s = sig.s.toArrayLike(node_buffer_1.Buffer, "be", 32);
            const v = (sig.recoveryParam ?? 0) + 27;
            const proofHex = "0x" + node_buffer_1.Buffer.concat([r, s, Uint8Array.from([v])]).toString("hex");
            const signatureDER = node_buffer_1.Buffer.from(sig.toDER());
            const last19 = signatureDER.slice(-19);
            const methodSpecific = "00" + last19.toString("hex");
            const did = `did:isbe:${this.NAMESPACE_CHILD}:${methodSpecific}`;
            console.log(chalk_1.default.yellow("DID secundario generado:"));
            console.log(" →", did, "\n");
            const fragment = this.fragmentFromDid(did);
            const now = Math.floor(Date.now() / 1000);
            const oneYear = 365 * 24 * 60 * 60;
            const jwk = this.publicKeyToJwk(pub);
            const payload = {
                did,
                baseDocument,
                vMethodId: fragment,
                publicKey: jwk,
                publickKey: jwk,
                ellipticType: this.ellipticType,
                notBefore: now,
                notAfter: now + oneYear,
            };
            if (aka)
                payload.alsoKnownAs = [aka];
            console.log(chalk_1.default.blue("Payload insertDidDocument:\n"));
            console.log(JSON.stringify(payload, null, 2));
            const { data } = await client_1.api.post("/insertDidDocument", payload);
            const rawTx = data?.rawTx ??
                data?.tx ??
                (typeof data === "string" ? data : undefined);
            if (!rawTx || !rawTx.startsWith("0x")) {
                throw new Error("La API no devolvió una rawTx válida");
            }
            await this.buildSignSend(rawTx);
            console.log(chalk_1.default.green("\nDID secundario insertado correctamente.\n"));
            (0, localStorage_1.saveDID)({
                did,
                type: "child",
                owner: await this.wallet.getAddress(),
                createdAt: Date.now(),
                baseDocument,
            });
            return {
                did,
                publicKeyHex: pubUncompressedHex,
                proofHex,
            };
        }
        catch (err) {
            console.error(chalk_1.default.red("Error creando DID secundario:"), err?.response?.data || err?.message || err);
            throw err;
        }
    }
    async updateBaseDocument(did, baseDocument) {
        console.log(chalk_1.default.cyan(`Actualizando baseDocument de ${did} vía API...`));
        const baseStr = typeof baseDocument === "string"
            ? baseDocument
            : JSON.stringify(baseDocument);
        try {
            const { data } = await client_1.api.post("/updateBaseDocument", {
                did,
                baseDocument: baseStr,
            });
            console.log(chalk_1.default.green("Respuesta API /updateBaseDocument (rawTx):"));
            console.log(JSON.stringify(data, null, 2));
            const rawTx = typeof data === "string" ? data : data?.tx;
            if (!rawTx || typeof rawTx !== "string" || !rawTx.startsWith("0x")) {
                throw new Error("API /updateBaseDocument devolvió una rawTx inválida");
            }
            await this.buildSignSend(rawTx);
            console.log(chalk_1.default.green("update-base finalizado (ON-CHAIN: transacción firmada y enviada)."));
        }
        catch (err) {
            console.error(chalk_1.default.red("Error en updateBaseDocument (ON-CHAIN):"), err?.response?.data || err.message || err);
            throw err;
        }
    }
    async updateAlsoKnownAs(did, alsoKnownAs) {
        console.log(chalk_1.default.cyan("Actualizando alsoKnownAs:"), "\n  DID:", did, "\n  Nuevo alias:", alsoKnownAs, "\n");
        try {
            const { data } = await client_1.api.post("/updateAlsoKnownAs", { did, alsoKnownAs: [alsoKnownAs] });
            console.log(chalk_1.default.green("Respuesta API /updateAlsoKnownAs:"));
            console.log(JSON.stringify(data, null, 2));
            const rawTx = (data && data.tx) ||
                (typeof data === "string" ? data : undefined);
            if (!rawTx || typeof rawTx !== "string" || !rawTx.startsWith("0x")) {
                throw new Error("API /updateAlsoKnownAs devolvió una rawTx inválida");
            }
            await this.buildSignSend(rawTx);
            console.log(chalk_1.default.green("update-alias finalizado (ON-CHAIN: tx firmada y enviada)."));
        }
        catch (err) {
            console.error(chalk_1.default.red("Error actualizando alsoKnownAs ON-CHAIN:"), err?.response?.data || err?.message || err);
            throw err;
        }
    }
    async listAll() {
        const all = (0, localStorage_1.readDIDs)();
        console.log(chalk_1.default.blueBright("DIDs encontrados en storage local:"));
        console.log(JSON.stringify(all, null, 2));
        return all;
    }
    async getDidOnChain(did) {
        console.log(chalk_1.default.cyan(`Consultando DID on-chain: ${did}`));
        const { data } = await client_1.api.get("/getDidDocument", {
            params: { did },
        });
        console.log(JSON.stringify(data, null, 2));
        return data;
    }
    async getDidByTimestampOnChain(did, timestamp) {
        console.log(chalk_1.default.cyan(`Consultando versión histórica ON-CHAIN para ${did}`));
        const { data } = await client_1.api.get("/getDidDocumentByTimestamp", {
            params: { did, timestamp },
        });
        console.log(JSON.stringify(data, null, 2));
        return data;
    }
    async listOnChainDIDs(page = 1, pageSize = 10) {
        console.log(chalk_1.default.blue(` Consultando DIDs on-chain vía API (page=${page}, pageSize=${pageSize})`));
        try {
            const { data } = await client_1.api.get("/getDids", {
                params: { page, pageSize },
            });
            console.log(chalk_1.default.green(" DIDs encontrados en blockchain (API):"));
            console.log(JSON.stringify(data, null, 2));
            return data;
        }
        catch (e) {
            console.error(chalk_1.default.red(" Error obteniendo DIDs on-chain vía API:"), e?.response?.data || e);
            throw e;
        }
    }
}
exports.default = DidCommands;
