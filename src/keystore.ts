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
 * Encrypted keystore, in the Web3 Secret Storage v3 format.
 *
 * This delegates to ethers rather than implementing scrypt/AES/MAC here.
 * Rolling our own bought nothing: the format is the same, and ethers' version
 * is read and written by far more people than ours would ever be. The file is
 * the standard one, so it also opens in geth, MetaMask and Besu tooling for
 * the Case Network.
 *
 * Consequence: **secp256k1 only.** The v3 format has no field for a curve and
 * ethers derives a secp256k1 address from whatever it is handed, so a P-256
 * key cannot be stored honestly. Bare Network support will need this revisited
 * — see `assertKeystoreSupportsCurve`.
 */

import { Buffer } from "node:buffer";
import {
  decryptKeystoreJson,
  encryptKeystoreJson,
  isKeystoreJson,
} from "ethers";
import { AcceptedCurves } from "./types";
import { getEc, publicKeyToEOA } from "./utils";

/**
 * scrypt work factor. 262144 is what geth writes for its standard profile;
 * ethers defaults to half that. Roughly a second and 256 MiB, which is the
 * point: it is what makes guessing the passphrase offline expensive.
 */
const SCRYPT_N = 262144;

/** The only curve a standard v3 keystore can represent. */
export const KEYSTORE_CURVE: AcceptedCurves = "secp256k1";

export class WrongPassphraseError extends Error {
  constructor() {
    super("Wrong passphrase, or the keystore file is corrupt.");
    this.name = "WrongPassphraseError";
  }
}

export class UnsupportedCurveError extends Error {
  constructor(curve: AcceptedCurves) {
    super(
      `Keystores are ${KEYSTORE_CURVE} only; ${curve} keys cannot be stored in the ` +
        `Web3 Secret Storage format, which has no field for a curve. ` +
        `Use --priv-key-stdin for ${curve} keys until Bare Network support lands.`,
    );
    this.name = "UnsupportedCurveError";
  }
}

/** Fails early, before a passphrase is asked for, when the curve has no keystore. */
export function assertKeystoreSupportsCurve(curve: AcceptedCurves): void {
  if (curve !== KEYSTORE_CURVE) throw new UnsupportedCurveError(curve);
}

/**
 * Encrypts a 32-byte private key under a passphrase.
 *
 * The caller keeps ownership of `privateKey` and is responsible for wiping it.
 */
export async function encryptKeystore(
  privateKey: Uint8Array,
  passphrase: string,
  curve: AcceptedCurves = KEYSTORE_CURVE,
): Promise<string> {
  assertKeystoreSupportsCurve(curve);
  if (privateKey.length !== 32) {
    throw new Error(
      `Invalid private key length: expected 32 bytes, got ${privateKey.length}`,
    );
  }

  const key = getEc(curve).keyFromPrivate(Buffer.from(privateKey));
  if (key.getPrivate().isZero()) {
    throw new Error("Invalid private key: zero is not a valid scalar.");
  }
  const address = await publicKeyToEOA(
    "0x" + key.getPublic().encode("hex", false),
  );

  return await encryptKeystoreJson(
    { address, privateKey: "0x" + Buffer.from(privateKey).toString("hex") },
    passphrase,
    { scrypt: { N: SCRYPT_N } },
  );
}

/**
 * Decrypts a keystore.
 *
 * The returned buffer holds live key material — wipe it, or hand it to a
 * `Signer` and call `destroy()`, as soon as it is no longer needed.
 *
 * Note: ethers hands the key back as a hex string, which V8 cannot zero. That
 * string lingers until the garbage collector reclaims it, so the wiping here
 * is a smaller guarantee than it looks. It was already best-effort.
 */
export async function decryptKeystore(
  keystore: unknown,
  passphrase: string,
): Promise<{ privateKey: Buffer; curve: AcceptedCurves }> {
  const json =
    typeof keystore === "string" ? keystore : JSON.stringify(keystore);

  if (!isKeystoreJson(json)) {
    throw new Error(
      "Not a Web3 Secret Storage v3 keystore. Expected a JSON object with " +
        "'version': 3 and a 'crypto' section.",
    );
  }

  let account;
  try {
    account = await decryptKeystoreJson(json, passphrase);
  } catch (err: any) {
    // ethers signals a bad passphrase with a plain TypeError.
    const message = String(err?.shortMessage ?? err?.message ?? "");
    if (/incorrect password|invalid password/i.test(message)) {
      throw new WrongPassphraseError();
    }
    throw err;
  }

  const privateKey = Buffer.from(account.privateKey.replace(/^0x/, ""), "hex");
  if (privateKey.length !== 32) {
    privateKey.fill(0);
    throw new Error(
      `Decrypted key has ${privateKey.length} bytes, expected 32.`,
    );
  }
  return { privateKey, curve: KEYSTORE_CURVE };
}
