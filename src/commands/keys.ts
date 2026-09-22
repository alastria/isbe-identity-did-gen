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

import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { AcceptedCurves, EcPublicJwk, GeneratedKeys } from "../types";
import {
  calculateJwkThumbprint,
  getEc,
  publicKeyToEOA,
  toJwk,
  wipe,
} from "../utils";

/**
 * Generates a key pair using the OS CSPRNG.
 *
 * `elliptic`'s own `genKeyPair()` would work, but drawing the scalar from
 * `node:crypto` keeps the randomness in one auditable place rather than
 * behind a dependency.
 */
export function generatePrivateKey(curve: AcceptedCurves): Buffer {
  const ec = getEc(curve);
  const n = ec.curve.n;

  // Rejection sampling: accept only scalars in [1, n-1], so the distribution
  // stays uniform. Reducing mod n instead would bias the low end.
  for (let attempt = 0; attempt < 128; attempt++) {
    const candidate = randomBytes(32);
    const value = ec.keyFromPrivate(candidate).getPrivate();
    if (!value.isZero() && value.cmp(n) < 0) return candidate;
    wipe(candidate);
  }
  /* istanbul ignore next — probability is negligible. */
  throw new Error("Failed to sample a valid private key.");
}

/**
 * Derives every public artifact from a private key.
 *
 * The private key is NOT part of the result: callers get the keystore, and
 * the raw key stays with whoever generated it.
 */
export async function derivePublicArtifacts(
  privateKey: Buffer,
  curve: AcceptedCurves,
): Promise<Omit<GeneratedKeys, "privateKeyHex" | "privateJwk">> {
  const key = getEc(curve).keyFromPrivate(privateKey);
  const publicKeyHex = "0x" + key.getPublic().encode("hex", false);
  const { d: _d, ...publicJwkBase } = toJwk(key, curve);
  const publicJwk: EcPublicJwk = publicJwkBase;

  return {
    publicKeyHex,
    publicJwk,
    thumbprint: await calculateJwkThumbprint(publicJwk),
    eoa: await publicKeyToEOA(publicKeyHex),
  };
}

/**
 * Full key material, private parts included.
 *
 * Only for `keys --print-private`, which asks for the key in the clear on
 * purpose. Everything else should go through the keystore.
 */
export async function generateKeys(
  curve: AcceptedCurves,
): Promise<GeneratedKeys> {
  const privateKey = generatePrivateKey(curve);
  try {
    const key = getEc(curve).keyFromPrivate(privateKey);
    const publicArtifacts = await derivePublicArtifacts(privateKey, curve);
    return {
      privateKeyHex: "0x" + privateKey.toString("hex"),
      privateJwk: toJwk(key, curve),
      ...publicArtifacts,
    };
  } finally {
    wipe(privateKey);
  }
}
