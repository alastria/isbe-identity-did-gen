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
exports.ControllerCommands = void 0;
const chalk_1 = __importDefault(require("chalk"));
const ethers_1 = require("ethers");
const node_buffer_1 = require("node:buffer");
const client_1 = require("../api/client");
const localStorage_1 = require("../utils/localStorage");
function isAddress(x) {
    return /^0x[a-fA-F0-9]{40}$/.test(x);
}
function isDid(x) {
    return x.startsWith("did:isbe:");
}
function resolveDidToAddress(did) {
    try {
        const found = (0, localStorage_1.findDID)(did);
        if (found && found.owner && isAddress(found.owner)) {
            return found.owner;
        }
    }
    catch { }
    return null;
}
function extractRawTx(data) {
    if (typeof data === "string")
        return data;
    if (data?.tx && typeof data.tx === "string")
        return data.tx;
    if (data?.rawTx && typeof data.rawTx === "string")
        return data.rawTx;
    if (data?.data && typeof data.data === "string")
        return data.data;
    return undefined;
}
class ControllerCommands {
    constructor(provider, wallet, rpcUrl) {
        this.provider = provider;
        this.wallet = wallet;
        this.rpcUrl = rpcUrl;
    }
    async normalizeControllerInput(input) {
        if (isAddress(input)) {
            return { address: input };
        }
        if (isDid(input)) {
            const localAddr = resolveDidToAddress(input);
            if (localAddr)
                return { did: input, address: localAddr };
            const onchainAddr = await this.resolveAddressOnChain(input);
            if (onchainAddr)
                return { did: input, address: onchainAddr };
            throw new Error(`No pude resolver la address del DID ${input}.
Ni está en .dids.json / .did_root, ni el contrato devolvió un owner.`);
        }
        throw new Error("Formato inválido de controller: " + input);
    }
    async addController(did, controllerDid) {
        console.log(chalk_1.default.cyan("Añadiendo controller: "), "\n   Controller (DID):", controllerDid, "\n   Target DID:", did, "\n");
        try {
            const { data } = await client_1.api.post("/addController", {
                did,
                controller: controllerDid,
            });
            console.log(chalk_1.default.green("Controller añadido."));
            console.log(JSON.stringify(data, null, 2));
            const rawTx = extractRawTx(data);
            if (!rawTx || !rawTx.startsWith("0x")) {
                console.error("Respuesta inesperada de /addController:", data);
                throw new Error("La API /addController no devolvió una rawTx válida (string 0x...)");
            }
            const receipt = await this.buildSignSend(rawTx);
            console.log(chalk_1.default.green(`add-controller ON-CHAIN completado. Tx: ${receipt?.hash ||
                receipt?.transactionHash ||
                "(hash no disponible)"}`));
        }
        catch (err) {
            console.error(chalk_1.default.red("Error en addController:"));
            console.error(err?.response?.data || err?.message || err);
            throw err;
        }
    }
    async revokeController(did, controllerDid) {
        console.log(chalk_1.default.cyan("Revocando controller: "), "\n   Controller (DID):", controllerDid, "\n   Target DID:", did, "\n");
        try {
            const { data } = await client_1.api.post("/revokeController", {
                did,
                controller: controllerDid,
            });
            console.log(chalk_1.default.green("Controller revocado."));
            console.log(JSON.stringify(data, null, 2));
            const rawTx = extractRawTx(data);
            if (!rawTx || !rawTx.startsWith("0x")) {
                console.error("Respuesta inesperada de /revokeController:", data);
                throw new Error("La API /revokeController no devolvió una rawTx válida (string 0x...)");
            }
            const receipt = await this.buildSignSend(rawTx);
            console.log(chalk_1.default.green(`revoke-controller ON-CHAIN completado. Tx: ${receipt?.hash ||
                receipt?.transactionHash ||
                "(hash no disponible)"}`));
        }
        catch (err) {
            console.error(chalk_1.default.red("Error en revokeController:"));
            console.error(err?.response?.data || err?.message || err);
            throw err;
        }
    }
    async checkController(targetDid, controllerInput) {
        console.log(chalk_1.default.blue("Verificando controller:"), "\n   Controller input:", controllerInput, "\n   Target DID:", targetDid, "\n");
        const { address } = await this.normalizeControllerInput(controllerInput);
        try {
            const res = await client_1.api.get("/checkController", {
                params: {
                    did: targetDid,
                    controllerId: address,
                },
            });
            console.log(chalk_1.default.green("Resultado checkController:"));
            console.log(JSON.stringify(res.data, null, 2));
            return res.data;
        }
        catch (err) {
            console.error("Error verificando controller");
            console.error(err?.response?.data || err?.message || err);
            throw err;
        }
    }
    async listDidsByController(controllerDid, page, pageSize) {
        console.log(chalk_1.default.blue(`Listando DIDs controlados por ${controllerDid} (page=${page}, size=${pageSize})…`));
        if (!isDid(controllerDid)) {
            throw new Error("list-dids-by-controller SOLO acepta DID como controller (no address).");
        }
        try {
            const res = await client_1.api.get("/getDidsByController", {
                params: {
                    controllerId: controllerDid,
                    page,
                    pageSize,
                },
            });
            console.log(chalk_1.default.green("Consulta completada:"));
            console.log(JSON.stringify(res.data, null, 2));
            return res.data;
        }
        catch (err) {
            console.error("Error listando DIDs por controller");
            console.error(err?.response?.data || err?.message || err);
            throw err;
        }
    }
    async resolveAddressOnChain(did) {
        try {
            const DID_REGISTRY_ADDRESS = process.env.DID_REGISTRY_ADDRESS;
            const abi = [
                "function ownerOf(bytes32 did) view returns (address)",
                "function didExists(bytes32 did) view returns (bool)",
            ];
            const contract = new ethers_1.ethers.Contract(DID_REGISTRY_ADDRESS, abi, this.provider);
            const didHash = ethers_1.ethers.keccak256(node_buffer_1.Buffer.from(did));
            const exists = await contract.didExists(didHash).catch(() => false);
            if (!exists)
                return null;
            const owner = await contract.ownerOf(didHash).catch(() => null);
            if (owner && owner !== ethers_1.ethers.ZeroAddress)
                return owner;
            return null;
        }
        catch (err) {
            console.error("resolveAddressOnChain error:", err);
            return null;
        }
    }
    /**
     * ✅ CLI FIRMA y ENVÍA (la API solo devuelve la tx sin firmar)
     */
    async buildSignSend(rawTxApi, overrideSigner) {
        try {
            const signer = overrideSigner ?? this.wallet;
            // La API puede mandar { tx: "0x..." } o directamente "0x..."
            const candidate = rawTxApi?.tx ?? rawTxApi;
            const from = await signer.getAddress();
            const network = await this.provider.getNetwork();
            const feeData = await this.provider.getFeeData();
            // ⚠️ sin BigInt literals (para ts target < ES2020)
            const fallbackFee = BigInt(1000000000); // 1 gwei
            const maxFeePerGas = feeData.maxFeePerGas ?? fallbackFee;
            const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? fallbackFee;
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
                    to: txReq.to,
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
            if (candidate && typeof candidate === "object" && (candidate.to || candidate.data)) {
                const dataHex = ethers_1.ethers.hexlify(candidate.data ?? "0x");
                if (!dataHex || dataHex === "0x")
                    throw new Error("TxRequest inválida: falta calldata (data).");
                const txReq = {
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
                        value: txReq.value ?? BigInt(0),
                    });
                }
                const sent = await signer.sendTransaction(txReq);
                const receipt = await sent.wait();
                if (!receipt)
                    throw new Error("Tx no minada (wait() devolvió null)");
                return receipt;
            }
            throw new Error("La API no devolvió tx válida (ni rawTx string ni txRequest object).");
        }
        catch (err) {
            console.error("Error en buildSignSend:", err?.response?.data || err?.message || err);
            throw err;
        }
    }
}
exports.ControllerCommands = ControllerCommands;
