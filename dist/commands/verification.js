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
const client_1 = require("../api/client");
class VerificationCLI {
    constructor(provider, wallet) {
        this.provider = provider;
        this.wallet = wallet;
    }
    pickRawTx(data) {
        const candidate = data?.tx ?? data?.rawTx ?? data;
        if (typeof candidate !== "string" || !candidate.startsWith("0x")) {
            throw new Error("La API no devolvió una rawTx válida (string 0x...)");
        }
        return candidate;
    }
    async buildSignSend(rawTxApi, overrideSigner) {
        const signer = overrideSigner ?? this.wallet;
        const rawTx = this.pickRawTx(rawTxApi);
        const from = await signer.getAddress();
        const network = await this.provider.getNetwork();
        const feeData = await this.provider.getFeeData();
        const maxFeePerGas = feeData.maxFeePerGas ?? BigInt(1000000000);
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? BigInt(1000000000);
        const parsed = ethers_1.ethers.Transaction.from(rawTx);
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
    async addRelationship(did, name, vMethodId, notBefore, notAfter) {
        console.log(chalk_1.default.blue(" Añadiendo Verification Relationship:"));
        console.log("   DID:", did);
        console.log("   name:", name);
        console.log("   vMethodId:", vMethodId);
        const now = Math.floor(Date.now() / 1000);
        const nb = notBefore ?? now;
        const na = notAfter ?? now + 365 * 24 * 3600;
        // ✅ API construye la tx (sin librería)
        const { data } = await client_1.api.post("/addVerificationRelationship", {
            did,
            name,
            vMethodId,
            notBefore: nb,
            notAfter: na,
        });
        // ✅ CLI firma y envía
        const receipt = await this.buildSignSend(data);
        console.log(chalk_1.default.green(`Verification Relationship añadida. Tx: ${receipt.hash ?? receipt.transactionHash}`));
        return receipt;
    }
    async listDidsByRelationship(vMethodId, name, page, pageSize) {
        console.log(chalk_1.default.blue(`Listando DIDs por Verification Relationship (vMethodId=${vMethodId}, name=${name}) page=${page}, size=${pageSize}`));
        if (page === 0) {
            console.log(chalk_1.default.yellow(" page=0 no es válido → usando page=1"));
            page = 1;
        }
        const res = await client_1.api.get("/getDidsByVerificationRelationship", {
            params: { vMethodId, name, page, pageSize },
        });
        console.log(chalk_1.default.green(" Consulta completada:"));
        console.log(JSON.stringify(res.data, null, 2));
        return res.data;
    }
}
exports.default = VerificationCLI;
