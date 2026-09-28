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

/**
 * Signs the unsigned transactions the did:isbe API builds.
 *
 * The API is a transaction builder: `POST /api/v1/contract/*` returns an
 * unsigned transaction, the holder signs it locally, and the raw payload goes
 * back to `POST /api/v1/transactions/send`. Without this command the only way
 * to sign was to paste the private key into a script, which is exactly what
 * the keystore is meant to avoid.
 *
 * This command does no networking on purpose: a process that holds decrypted
 * key material should not also be opening sockets. It reads a transaction and
 * writes the signed payload to stdout, so it composes with curl.
 */

import { readFileSync } from "node:fs";
import { TransactionLike } from "ethers";
import { Signer } from "../signer";
import { readStdin } from "../prompt";

/** Fields the API is allowed to dictate. Anything else is rejected. */
const ALLOWED_FIELDS = new Set([
  "to",
  "from",
  "nonce",
  "gasLimit",
  "gasPrice",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
  "data",
  "value",
  "chainId",
  "type",
  "accessList",
]);

export type UnsignedTx = TransactionLike & { from?: string };

export function parseUnsignedTx(raw: string): UnsignedTx {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Transaction is not valid JSON. Pass the object the API returned, verbatim.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Transaction must be a JSON object.");
  }

  const tx = parsed as Record<string, unknown>;
  const unknownFields = Object.keys(tx).filter((k) => !ALLOWED_FIELDS.has(k));
  if (unknownFields.length > 0) {
    throw new Error(
      `Transaction has unexpected fields: ${unknownFields.join(", ")}. Refusing to sign it.`,
    );
  }
  if (typeof tx.to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(tx.to)) {
    throw new Error("Transaction has no valid 'to' address.");
  }
  return tx as UnsignedTx;
}

export async function readUnsignedTx(source: {
  txFile?: string;
  tx?: string;
}): Promise<UnsignedTx> {
  if (source.txFile && source.tx) {
    throw new Error("Pass either --tx-file or --tx, not both.");
  }
  if (source.txFile) return parseUnsignedTx(readFileSync(source.txFile, "utf8"));
  if (source.tx) return parseUnsignedTx(source.tx);
  return parseUnsignedTx(await readStdin());
}

export type SignedTxResult = {
  signedRawTransaction: string;
  from: string;
  to: string;
  chainId: string;
  nonce: number | undefined;
};

/**
 * Signs the transaction after checking it is actually for this signer.
 *
 * The `from` check matters: the API builds the transaction from a `from` the
 * caller supplied, and signing with a different key would produce a payload
 * that fails on-chain in a confusing way — or, worse, spends from a key the
 * holder did not mean to use.
 */
export async function signTransaction(
  signer: Signer,
  tx: UnsignedTx,
): Promise<SignedTxResult> {
  const address = await signer.getAddress();

  if (tx.from && tx.from.toLowerCase() !== address.toLowerCase()) {
    throw new Error(
      `Transaction is addressed from ${tx.from} but this keystore holds ${address}. Refusing to sign it.`,
    );
  }

  const signedRawTransaction = await signer.signTransaction(tx);

  return {
    signedRawTransaction,
    from: address,
    to: tx.to as string,
    chainId: String(tx.chainId ?? ""),
    nonce: tx.nonce === undefined ? undefined : Number(tx.nonce),
  };
}
