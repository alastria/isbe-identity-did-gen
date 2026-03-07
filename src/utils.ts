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

import elliptic from "elliptic";
import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import bs58 from "bs58";
import { AcceptedCurves } from "./types";
import { DID_ISBE_METHOD_NAME, DID_ISBE_VERSION_BYTE } from "./constants";

function normalizePrivKey(privKey: string): string {
  const pk = String(privKey ?? "").trim();
  const hex = pk.startsWith("0x") ? pk.slice(2) : pk;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "Invalid private key format. Expected a 64-character hexadecimal string, optionally prefixed with '0x'.",
    );
  }
  return hex.toLowerCase();
}

export function getPublicKey(privHex: string, curve: AcceptedCurves) {
  const ec =
    curve === "P-256" ? new elliptic.ec("p256") : new elliptic.ec("secp256k1");

  const key = ec.keyFromPrivate(privHex.replace(/^0x/, ""), "hex");
  const pubUncompressed = Buffer.from(
    key.getPublic().encode("hex", false),
    "hex",
  );
  return "0x" + pubUncompressed.toString("hex");
}

export function generateProof(privHex: string, curve: AcceptedCurves): string {
  const normalizedPrivHex = normalizePrivKey(privHex);

  const ec =
    curve === "P-256" ? new elliptic.ec("p256") : new elliptic.ec("secp256k1");

  const key = ec.keyFromPrivate(normalizedPrivHex, "hex");
  const pubUncompressed = Buffer.from(
    key.getPublic().encode("hex", false),
    "hex",
  );

  // Remove the first byte (0x04) that indicates uncompressed format
  const pubXY = pubUncompressed.slice(1);

  const msg = keccak_256(pubXY);
  const sig = key.sign(msg, { canonical: true });
  const r = sig.r.toArrayLike(Buffer, "be", 32);
  const s = sig.s.toArrayLike(Buffer, "be", 32);
  const v = (sig.recoveryParam ?? 0) + 27;
  const proof = Buffer.concat([r, s, Buffer.from([v])]);

  return "0x" + proof.toString("hex");
}

export function buildDID(proof: string, modelDeploy: string) {
  const proofBuffer = Buffer.from(proof.replace(/^0x/, ""), "hex");

  const last19 = proofBuffer.slice(-19);
  const versionByte = Buffer.from([DID_ISBE_VERSION_BYTE]);
  const methodBytes = Buffer.concat([versionByte, last19]);
  const methodSpecificId = `z${bs58.encode(methodBytes)}`;

  return `did:${DID_ISBE_METHOD_NAME}:${modelDeploy}:${methodSpecificId}`;
}
