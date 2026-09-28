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

import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import bs58 from "bs58";
import { AcceptedCurves } from "../types";
import { DID_ISBE_METHOD_NAME, DID_ISBE_VERSION_BYTE } from "../constants";
import { LocalKeySigner, Signer } from "../signer";

/**
 * Builds the proof of possession the DID Registry expects.
 *
 * The registry verifies it in `DidDocumentDetailedInternal._validateProof`:
 *
 *   ecrecover(keccak256(publicKey), proof) == addressOf(publicKey)
 *
 * so the signed digest is `keccak256(X || Y)` over the *unprefixed* 64-byte
 * public key, with no EIP-191 message prefix. Signing anything else — or
 * adding a prefix — makes the recovered address wrong and the insert revert.
 *
 * The signature is deterministic (RFC 6979), so the same key always yields
 * the same proof, and therefore the same DID.
 */
export function proofFromSigner(signer: Signer): string {
  // Drop the leading 0x04 that marks the uncompressed encoding.
  const pubXY = Buffer.from(signer.getPublicKey().slice(2), "hex").subarray(1);

  const { r, s, v } = signer.signDigest(keccak_256(pubXY));
  return "0x" + Buffer.concat([r, s, Buffer.from([v])]).toString("hex");
}

/**
 * Proof from a raw private key.
 *
 * Kept for the golden-vector suite and for callers that already hold key
 * bytes. Prefer `proofFromSigner`, which never needs the key in hand.
 */
export function generateProof(privHex: string, curve: AcceptedCurves): string {
  const signer = LocalKeySigner.fromHex(privHex, curve);
  try {
    return proofFromSigner(signer);
  } finally {
    signer.destroy();
  }
}

/**
 * Derives the DID from the proof.
 *
 * Layout checked on-chain: `0x00 || proof[-19:]`, base58-encoded with a
 * multibase `z` prefix. Taking the identifier from the signature is what
 * stops anyone from choosing a vanity DID for a key they control.
 */
export function buildDID(proof: string, modelDeploy: string) {
  const proofBuffer = Buffer.from(proof.replace(/^0x/, ""), "hex");

  const last19 = proofBuffer.subarray(-19);
  const versionByte = Buffer.from([DID_ISBE_VERSION_BYTE]);
  const methodBytes = Buffer.concat([versionByte, last19]);
  const methodSpecificId = `z${bs58.encode(methodBytes)}`;

  return `did:${DID_ISBE_METHOD_NAME}:${modelDeploy}:${methodSpecificId}`;
}
