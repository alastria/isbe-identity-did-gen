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
import { api } from "../api/client";

export default class VerificationCLI {
  private provider: JsonRpcProvider;
  private wallet: Wallet;

  constructor(provider: JsonRpcProvider, wallet: Wallet) {
    this.provider = provider;
    this.wallet = wallet;
  }

  private pickRawTx(data: any): string {
    const candidate = data?.tx ?? data?.rawTx ?? data;
    if (typeof candidate !== "string" || !candidate.startsWith("0x")) {
      throw new Error("La API no devolvió una rawTx válida (string 0x...)");
    }
    return candidate;
  }

  private async buildSignSend(rawTxApi: any, overrideSigner?: Wallet) {
    const signer = overrideSigner ?? this.wallet;

    const rawTx = this.pickRawTx(rawTxApi);

    const from = await signer.getAddress();
    const network = await this.provider.getNetwork();
    const feeData = await this.provider.getFeeData();

    const maxFeePerGas = feeData.maxFeePerGas ?? BigInt(1_000_000_000);
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? BigInt(1_000_000_000);

    const parsed = ethers.Transaction.from(rawTx);

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

  async addRelationship(
    did: string,
    name: string,
    vMethodId: string,
    notBefore?: number,
    notAfter?: number
  ) {
    console.log(chalk.blue(" Añadiendo Verification Relationship:"));
    console.log("   DID:", did);
    console.log("   name:", name);
    console.log("   vMethodId:", vMethodId);

    const now = Math.floor(Date.now() / 1000);
    const nb = notBefore ?? now;
    const na = notAfter ?? now + 365 * 24 * 3600;

    const { data } = await api.post("/addVerificationRelationship", {
      did,
      name,
      vMethodId,
      notBefore: nb,
      notAfter: na,
    });

    const receipt = await this.buildSignSend(data);

    console.log(
      chalk.green(
        `Verification Relationship añadida. Tx: ${(receipt as any).hash ?? (receipt as any).transactionHash}`
      )
    );

    return receipt;
  }

  async listDidsByRelationship(
    vMethodId: string,
    name: string,
    page: number,
    pageSize: number
  ) {
    console.log(
      chalk.blue(
        `Listando DIDs por Verification Relationship (vMethodId=${vMethodId}, name=${name}) page=${page}, size=${pageSize}`
      )
    );

    if (page === 0) {
      console.log(chalk.yellow(" page=0 no es válido → usando page=1"));
      page = 1;
    }

    const res = await api.get("/getDidsByVerificationRelationship", {
      params: { vMethodId, name, page, pageSize },
    });

    console.log(chalk.green(" Consulta completada:"));
    console.log(JSON.stringify(res.data, null, 2));

    return res.data;
  }
}
