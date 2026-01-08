"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
const ethers_1 = require("ethers");
const sha3_1 = require("@noble/hashes/sha3");
const node_buffer_1 = require("node:buffer");
const bs58_1 = __importDefault(require("bs58"));
const client_1 = require("../api/client");
class DidRelationship {
    constructor(provider, wallet, _rpcUrl) {
        this.provider = provider;
        this.wallet = wallet;
    }
    generateFragment(did) {
        const hash = (0, sha3_1.keccak_256)(node_buffer_1.Buffer.from(did + Date.now().toString()));
        return bs58_1.default.encode(node_buffer_1.Buffer.from(hash.slice(0, 8)));
    }
    normalizeAndValidateJwk(input) {
        let obj;
        try {
            obj = JSON.parse(input);
        }
        catch {
            throw new Error('La publicKey debe venir como JSON string válido (JWK). Ej: --jwk \'{"kty":"EC","crv":"secp256k1","x":"...","y":"..."}\'');
        }
        const jwk = obj;
        if (!jwk || typeof jwk !== "object")
            throw new Error("JWK inválido: no es un objeto JSON.");
        if (jwk.kty !== "EC")
            throw new Error(`JWK inválido: kty debe ser "EC" (recibido: ${String(jwk.kty)})`);
        if (!jwk.crv || typeof jwk.crv !== "string")
            throw new Error("JWK inválido: falta 'crv' (string).");
        if (!jwk.x || typeof jwk.x !== "string" || !jwk.y || typeof jwk.y !== "string") {
            throw new Error("JWK inválido: faltan 'x' y/o 'y' (base64url strings).");
        }
        return JSON.stringify(jwk);
    }
    pickRawTx(data) {
        if (typeof data === "string")
            return data;
        if (data && typeof data === "object") {
            const maybeObj = data;
            return maybeObj.tx ?? maybeObj.rawTx ?? data;
        }
        return data;
    }
    async buildSignSend(rawTxApi, overrideSigner) {
        const signer = overrideSigner ?? this.wallet;
        const from = await signer.getAddress();
        const network = await this.provider.getNetwork();
        const feeData = await this.provider.getFeeData();
        const maxFeePerGas = feeData.maxFeePerGas ?? BigInt(1000000000);
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? BigInt(1000000000);
        const candidate = this.pickRawTx(rawTxApi);
        // 1) RAW TX string
        if (typeof candidate === "string" && candidate.startsWith("0x")) {
            const parsed = ethers_1.ethers.Transaction.from(candidate);
            const to = parsed.to ?? undefined;
            const dataHex = ethers_1.ethers.hexlify(parsed.data ?? "0x");
            if (!to)
                throw new Error("RawTx inválida: falta 'to'.");
            if (!dataHex || dataHex === "0x")
                throw new Error("RawTx inválida: falta calldata (data).");
            const txReq = {
                to,
                data: dataHex,
                value: parsed.value ?? BigInt(0),
                nonce: await this.provider.getTransactionCount(from, "pending"),
                chainId: Number(network.chainId),
                type: 2,
                maxFeePerGas,
                maxPriorityFeePerGas,
            };
            txReq.gasLimit = await this.provider.estimateGas({
                from,
                to,
                data: txReq.data,
                value: txReq.value ?? BigInt(0),
            });
            const sent = await signer.sendTransaction(txReq);
            const receipt = await sent.wait();
            if (!receipt)
                throw new Error("Tx no minada (wait() devolvió null)");
            return receipt;
        }
        // 2) TxRequest object
        if (candidate && typeof candidate === "object") {
            const txObj = candidate;
            if (!txObj.to && !txObj.data) {
                throw new Error("TxRequest inválida: faltan 'to' y 'data'.");
            }
            const dataHex = ethers_1.ethers.hexlify(txObj.data ?? "0x");
            if (!dataHex || dataHex === "0x")
                throw new Error("TxRequest inválida: falta calldata (data).");
            const txReq = {
                ...txObj,
                from: undefined,
                data: dataHex,
                nonce: await this.provider.getTransactionCount(from, "pending"),
                chainId: txObj.chainId ?? Number(network.chainId),
                type: 2,
                maxFeePerGas,
                maxPriorityFeePerGas,
            };
            if (!txReq.gasLimit) {
                txReq.gasLimit = await this.provider.estimateGas({
                    from,
                    to: txReq.to,
                    data: txReq.data,
                    value: txReq.value ?? BigInt(0),
                });
            }
            const sent = await signer.sendTransaction(txReq);
            const receipt = await sent.wait();
            if (!receipt)
                throw new Error("Tx no minada (wait() devolvió null)");
            return receipt;
        }
        throw new Error("La API no devolvió una tx válida (ni rawTx string ni txRequest object).");
    }
    async addVerificationMethod(did, publicKeyJwk, ellipticType = 1) {
        console.log(chalk_1.default.blueBright(`Añadiendo verificationMethod a ${did}`));
        const fragment = this.generateFragment(did);
        const normalizedJwk = this.normalizeAndValidateJwk(publicKeyJwk);
        const payload = {
            did,
            vMethodId: fragment, // la API espera fragment
            publicKey: normalizedJwk,
            ellipticType,
        };
        const { data } = await client_1.api.post("/api/v1/addVerificationMethod", payload);
        const receipt = await this.buildSignSend(data);
        console.log(chalk_1.default.green("Verification method añadido correctamente"));
        console.log("Tx:", receipt.hash ?? receipt.transactionHash);
        console.log("Fragment generado:", fragment);
        return fragment;
    }
    async revokeVerificationMethod(did, fragment, notAfter = Math.floor(Date.now() / 1000)) {
        console.log(chalk_1.default.blue(`Revocando ${fragment} en ${did}`));
        const payload = { did, vMethodId: fragment, notAfter };
        const { data } = await client_1.api.post("/api/v1/revokeVerificationMethod", payload);
        const receipt = await this.buildSignSend(data);
        console.log(chalk_1.default.green(`Revocado on-chain. Tx: ${receipt.hash ?? receipt.transactionHash}`));
        return receipt;
    }
    async expireVerificationMethod(did, fragment, newNotAfter) {
        console.log(chalk_1.default.blue(`Expirando verificationMethod ${fragment} en ${did}`));
        const payload = { did, vMethodId: fragment, notAfter: newNotAfter };
        const { data } = await client_1.api.post("/api/v1/expireVerificationMethod", payload);
        const receipt = await this.buildSignSend(data);
        console.log(chalk_1.default.green(`Expirado on-chain. Tx: ${receipt.hash ?? receipt.transactionHash}`));
        return receipt;
    }
    async rollVerificationMethod(did, oldFragment, newPublicKeyJwk, ellipticType = 1, duration = 365 * 24 * 60 * 60) {
        console.log(chalk_1.default.blue(`Rotando verificationMethod ${oldFragment} en ${did}`));
        const now = Math.floor(Date.now() / 1000);
        const newFragment = this.generateFragment(did);
        const normalizedJwk = this.normalizeAndValidateJwk(newPublicKeyJwk);
        const payload = {
            did,
            vMethodId: newFragment,
            publicKey: normalizedJwk,
            ellipticType,
            notBefore: now,
            notAfter: now + duration,
            oldVMethodId: oldFragment,
            duration,
        };
        const { data } = await client_1.api.post("/api/v1/rollVerificationMethod", payload);
        const receipt = await this.buildSignSend(data);
        console.log(chalk_1.default.green(`Rotado on-chain. Tx: ${receipt.hash ?? receipt.transactionHash}`));
        console.log("Nuevo fragment:", newFragment);
        return newFragment;
    }
}
exports.default = DidRelationship;
