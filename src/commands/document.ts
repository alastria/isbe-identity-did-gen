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

export type OfflineCurve = 1 | 2;

export type JwkEc = {
  kty: "EC";
  crv: string;
  x: string;
  y: string;
  kid?: string;
  use?: string;
  alg?: string;
};

export type OutputOffchain = {
  did: string;
  publicKeyJwk: JwkEc;
  publicKeyHex: string;     
  proofHex: string;         
  vMethodId: string;        
  ellipticType: OfflineCurve;
  namespace: string;
  methodSpecificId: string;
  notBefore: number;        
  notAfter: number;         
  baseDocument: string;     
  alsoKnownAs?: string[];
  hashToSign: string;       
  proofRsv: string;         
};

function normalizePrivKey(privKey: string): string {
  const pk = String(privKey ?? "").trim();
  const hex = pk.startsWith("0x") ? pk.slice(2) : pk;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("Private key inválida: debe ser hex 32 bytes (64 chars), con o sin 0x.");
  }
  return hex.toLowerCase();
}

function ellipticTypeToCurveName(ellipticType: OfflineCurve): string {
  return ellipticType === 2 ? "p256" : "secp256k1";
}

function ellipticTypeToJwkCrv(ellipticType: OfflineCurve): string {
  return ellipticType === 2 ? "P-256" : "secp256k1";
}

function publicKeyToHexXY(pub: any): string {
  const xBuf = Buffer.from(pub.getX().toArrayLike(Buffer, "be", 32));
  const yBuf = Buffer.from(pub.getY().toArrayLike(Buffer, "be", 32));
  return "0x" + Buffer.concat([xBuf, yBuf]).toString("hex");
}

function publicKeyToJwk(pub: any, ellipticType: OfflineCurve): JwkEc {
  const xBuf = Buffer.from(pub.getX().toArrayLike(Buffer, "be", 32));
  const yBuf = Buffer.from(pub.getY().toArrayLike(Buffer, "be", 32));
  return {
    kty: "EC",
    crv: ellipticTypeToJwkCrv(ellipticType),
    x: xBuf.toString("base64url"),
    y: yBuf.toString("base64url"),
  };
}

function buildMethodSpecificIdFromSigDER(sigDER: Buffer): string {
  const last19 = sigDER.slice(-19);
  return ("00" + last19.toString("hex")).toLowerCase();
}

function vMethodIdFromDid(did: string): string {
  const digest = keccak_256(Buffer.from(did));
  const first8 = Buffer.from(digest.slice(0, 8));
  return bs58.encode(first8);
}

function buildProofRsv(key: elliptic.ec.KeyPair) {
  const pub = key.getPublic();
  const xBuf = Buffer.from(pub.getX().toArrayLike(Buffer, "be", 32));
  const yBuf = Buffer.from(pub.getY().toArrayLike(Buffer, "be", 32));

  const msgHashBytes = keccak_256(Buffer.concat([xBuf, yBuf]));
  const sig = key.sign(msgHashBytes, { canonical: true });

  const r = sig.r.toArrayLike(Buffer, "be", 32);
  const s = sig.s.toArrayLike(Buffer, "be", 32);
  const v = (sig.recoveryParam ?? 0) + 27;
  const rHex = r.toString("hex");
  const sHex = s.toString("hex");
  const vHex = v.toString(16).padStart(2, "0");

  const rsvBytes = Buffer.concat([r, s, Uint8Array.from([v])]);

  return {
    hashToSign: "0x" + Buffer.from(msgHashBytes).toString("hex"),
    proofRsv: "0x" + rsvBytes.toString("hex"),
    rHex,
    sHex,
    vHex,
    sigDER: Buffer.from(sig.toDER()),
  };
}

export type GenerateParams = {
  privKey: string;
  ellipticType?: OfflineCurve;             
  modelDeployId?: string;          
  baseDocument?: string;           
  alsoKnownAs?: string[];          
  durationDays?: number;           
};

export function generateOffchainDid(params: GenerateParams): OutputOffchain {
  const ellipticType: OfflineCurve = (params.ellipticType ?? 1) as OfflineCurve;
  if (ellipticType !== 1 && ellipticType !== 2) {
    throw new Error("ellipticType inválido. Usa 1 (secp256k1) o 2 (p256).");
  }

  const privHex = normalizePrivKey(params.privKey);
  const curveName = ellipticTypeToCurveName(ellipticType);
  const ec = new elliptic.ec(curveName);
  const key = ec.keyFromPrivate(privHex, "hex");

  const proof = buildProofRsv(key);
  const methodSpecificId = buildMethodSpecificIdFromSigDER(proof.sigDER);

  const namespace = (params.modelDeployId ?? "uc").trim() || "uc";
  const did = `did:isbe:${namespace}:${methodSpecificId}`;

  const pub = key.getPublic();
  const publicKeyHex = publicKeyToHexXY(pub);
  const publicKeyJwk = publicKeyToJwk(pub, ellipticType);

  const proofHex = proof.proofRsv.toLowerCase();

  const proofBytes = Buffer.from(proofHex.slice(2), "hex");
  if (proofBytes.length !== 65) {
    throw new Error(`Proof inválida: esperado 65 bytes, obtenido ${proofBytes.length}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const durationDays = params.durationDays ?? 365;
  const notBefore = now;
  const notAfter = now + durationDays * 24 * 60 * 60;

  const baseDocument = (params.baseDocument ?? "{}").trim();
  const vMethodId = vMethodIdFromDid(did);

  return {
    did,
    publicKeyJwk,
    publicKeyHex,
    proofHex,

    vMethodId,
    ellipticType,
    namespace,
    methodSpecificId,
    notBefore,
    notAfter,
    baseDocument,
    alsoKnownAs: params.alsoKnownAs,

    hashToSign: proof.hashToSign,
    proofRsv: proof.proofRsv,
  };
}
