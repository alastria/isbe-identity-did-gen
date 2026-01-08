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
import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import bs58 from "bs58";
import { api } from "../api/client";

type JwkEc = {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid?: string;
  use?: string;
  alg?: string;
};

type ApiTxObject = {
  tx?: any;
  rawTx?: any;
  data?: any;
};

type ApiTxResponse = string | ApiTxObject | ethers.TransactionRequest;

export default class DidRelationship {
  private provider: JsonRpcProvider;
  private wallet: Wallet;

  constructor(provider: JsonRpcProvider, wallet: Wallet, _rpcUrl: string) {
    this.provider = provider;
    this.wallet = wallet;
  }

  private generateFragment(did: string): string {
    const hash = keccak_256(Buffer.from(did + Date.now().toString()));
    return bs58.encode(Buffer.from(hash.slice(0, 8)));
  }

  private normalizeAndValidateJwk(input: string): string {
    let obj: any;
    try {
      obj = JSON.parse(input);
    } catch {
      throw new Error(
        'La publicKey debe venir como JSON string válido (JWK). Ej: --jwk \'{"kty":"EC","crv":"secp256k1","x":"...","y":"..."}\''
      );
    }

    const jwk = obj as Partial<JwkEc>;
    if (!jwk || typeof jwk !== "object") throw new Error("JWK inválido: no es un objeto JSON.");
    if (jwk.kty !== "EC") throw new Error(`JWK inválido: kty debe ser "EC" (recibido: ${String(jwk.kty)})`);
    if (!jwk.crv || typeof jwk.crv !== "string") throw new Error("JWK inválido: falta 'crv' (string).");
    if (!jwk.x || typeof jwk.x !== "string" || !jwk.y || typeof jwk.y !== "string") {
      throw new Error("JWK inválido: faltan 'x' y/o 'y' (base64url strings).");
    }

    return JSON.stringify(jwk);
  }

  private pickRawTx(data: ApiTxResponse): ApiTxResponse {
    if (typeof data === "string") return data;

    if (data && typeof data === "object") {
      const maybeObj = data as ApiTxObject;
      return maybeObj.tx ?? maybeObj.rawTx ?? data;
    }

    return data;
  }

  private async buildSignSend(rawTxApi: ApiTxResponse, overrideSigner?: Wallet): Promise<TransactionReceipt> {
    const signer = overrideSigner ?? this.wallet;

    const from = await signer.getAddress();
    const network = await this.provider.getNetwork();
    const feeData = await this.provider.getFeeData();

    const maxFeePerGas = feeData.maxFeePerGas ?? BigInt(1_000_000_000);
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? BigInt(1_000_000_000);

    const candidate = this.pickRawTx(rawTxApi);

    // 1) RAW TX string
    if (typeof candidate === "string" && candidate.startsWith("0x")) {
      const parsed = ethers.Transaction.from(candidate);

      const to = parsed.to ?? undefined;
      const dataHex = ethers.hexlify(parsed.data ?? "0x");

      if (!to) throw new Error("RawTx inválida: falta 'to'.");
      if (!dataHex || dataHex === "0x") throw new Error("RawTx inválida: falta calldata (data).");

      const txReq: ethers.TransactionRequest = {
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
      if (!receipt) throw new Error("Tx no minada (wait() devolvió null)");
      return receipt;
    }

    // 2) TxRequest object
    if (candidate && typeof candidate === "object") {
      const txObj = candidate as ethers.TransactionRequest;

      if (!txObj.to && !txObj.data) {
        throw new Error("TxRequest inválida: faltan 'to' y 'data'.");
      }

      const dataHex = ethers.hexlify(txObj.data ?? "0x");
      if (!dataHex || dataHex === "0x") throw new Error("TxRequest inválida: falta calldata (data).");

      const txReq: ethers.TransactionRequest = {
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
      if (!receipt) throw new Error("Tx no minada (wait() devolvió null)");
      return receipt;
    }

    throw new Error("La API no devolvió una tx válida (ni rawTx string ni txRequest object).");
  }

  async addVerificationMethod(did: string, publicKeyJwk: string, ellipticType = 1) {
    console.log(chalk.blueBright(`Añadiendo verificationMethod a ${did}`));

    const fragment = this.generateFragment(did);
    const normalizedJwk = this.normalizeAndValidateJwk(publicKeyJwk);

    const payload = {
      did,
      vMethodId: fragment, // la API espera fragment
      publicKey: normalizedJwk,
      ellipticType,
    };

    const { data } = await api.post<ApiTxResponse>("/api/v1/addVerificationMethod", payload);
    const receipt = await this.buildSignSend(data);

    console.log(chalk.green("Verification method añadido correctamente"));
    console.log("Tx:", (receipt as any).hash ?? (receipt as any).transactionHash);
    console.log("Fragment generado:", fragment);

    return fragment;
  }

  async revokeVerificationMethod(did: string, fragment: string, notAfter: number = Math.floor(Date.now() / 1000)) {
    console.log(chalk.blue(`Revocando ${fragment} en ${did}`));

    const payload = { did, vMethodId: fragment, notAfter };

    const { data } = await api.post<ApiTxResponse>("/api/v1/revokeVerificationMethod", payload);
    const receipt = await this.buildSignSend(data);

    console.log(chalk.green(`Revocado on-chain. Tx: ${(receipt as any).hash ?? (receipt as any).transactionHash}`));
    return receipt;
  }

  async expireVerificationMethod(did: string, fragment: string, newNotAfter: number) {
    console.log(chalk.blue(`Expirando verificationMethod ${fragment} en ${did}`));

    const payload = { did, vMethodId: fragment, notAfter: newNotAfter };

    const { data } = await api.post<ApiTxResponse>("/api/v1/expireVerificationMethod", payload);
    const receipt = await this.buildSignSend(data);

    console.log(chalk.green(`Expirado on-chain. Tx: ${(receipt as any).hash ?? (receipt as any).transactionHash}`));
    return receipt;
  }

  async rollVerificationMethod(
    did: string,
    oldFragment: string,
    newPublicKeyJwk: string,
    ellipticType = 1,
    duration = 365 * 24 * 60 * 60
  ) {
    console.log(chalk.blue(`Rotando verificationMethod ${oldFragment} en ${did}`));

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

    const { data } = await api.post<ApiTxResponse>("/api/v1/rollVerificationMethod", payload);
    const receipt = await this.buildSignSend(data);

    console.log(chalk.green(`Rotado on-chain. Tx: ${(receipt as any).hash ?? (receipt as any).transactionHash}`));
    console.log("Nuevo fragment:", newFragment);

    return newFragment;
  }
}
