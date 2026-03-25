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

import { AcceptedCurves, EcPublicJwk, GeneratedKeys } from "../types";
import { getEc, toJwk } from "../utils";

export function generateKeys(curve: AcceptedCurves): GeneratedKeys {
  const ec = getEc(curve);
  const key = ec.genKeyPair();
  const privateKeyHex = "0x" + key.getPrivate("hex").padStart(64, "0");
  const publicKeyHex = "0x" + key.getPublic().encode("hex", false);
  const privateJwk = toJwk(key, curve);
  const { d: _d, ...publicJwkBase } = privateJwk;
  const publicJwk: EcPublicJwk = publicJwkBase;

  return {
    privateKeyHex,
    publicKeyHex,
    privateJwk,
    publicJwk,
  };
}
