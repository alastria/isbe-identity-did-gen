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
import { Buffer } from "node:buffer";
import * as jose from "jose";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  AcceptedAlgorithms,
  AcceptedCurves,
  EcPrivateJwk,
  EcPublicJwk,
} from "./types";

export function normalizePrivKey(privKey: string): string {
  const pk = String(privKey ?? "").trim();
  const hex = pk.startsWith("0x") ? pk.slice(2) : pk;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "Invalid private key format. Expected a 64-character hexadecimal string, optionally prefixed with '0x'.",
    );
  }
  return hex.toLowerCase();
}

export function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function getEc(curve: AcceptedCurves): elliptic.ec {
  return curve === "P-256"
    ? new elliptic.ec("p256")
    : new elliptic.ec("secp256k1");
}

export function toJwk(
  key: elliptic.ec.KeyPair,
  curve: AcceptedCurves,
): EcPrivateJwk {
  const alg: AcceptedAlgorithms = curve === "P-256" ? "ES256" : "ES256K";
  const x = key.getPublic().getX().toArrayLike(Buffer, "be", 32);
  const y = key.getPublic().getY().toArrayLike(Buffer, "be", 32);
  const d = key.getPrivate().toArrayLike(Buffer, "be", 32);

  return {
    kty: "EC",
    crv: curve,
    alg,
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    d: base64UrlEncode(d),
  };
}

export function getPublicKey(privHex: string, curve: AcceptedCurves) {
  const ec = getEc(curve);

  const key = ec.keyFromPrivate(privHex.replace(/^0x/, ""), "hex");
  const pubUncompressed = Buffer.from(
    key.getPublic().encode("hex", false),
    "hex",
  );
  return "0x" + pubUncompressed.toString("hex");
}

export async function calculateJwkThumbprint(jwk: EcPublicJwk): Promise<string> {
  return await jose.calculateJwkThumbprint(jwk);
}

export async function publicKeyToEOA(hexPubKey: string): Promise<string> {
  // Remover el prefijo 0x si existe
  let pubKey = hexPubKey.startsWith("0x") ? hexPubKey.slice(2) : hexPubKey;

  // Remover el prefijo 04 que indica formato no comprimido, si existe
  if (pubKey.startsWith("04")) {
    pubKey = pubKey.slice(2);
  }

  // Convertir la clave pública a Buffer
  const pubKeyBuffer = Buffer.from(pubKey, "hex");

  // Calcular hash Keccak-256
  const hash = keccak_256(pubKeyBuffer);

  // Tomar los últimos 20 bytes del hash para obtener la dirección
  const addressBytes = hash.slice(-20);

  // Retornar la dirección con prefijo 0x
  return "0x" + Buffer.from(addressBytes).toString("hex");
}