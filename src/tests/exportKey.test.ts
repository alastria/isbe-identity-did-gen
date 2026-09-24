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

import { Buffer } from "node:buffer";
import { Wallet } from "ethers";
import { encryptKeystore, WrongPassphraseError } from "../keystore";
import { exportPrivateKey } from "../commands/exportKey";
import { generateProof } from "../commands/did";
import { LocalKeySigner } from "../signer";

const PRIV_HEX =
  "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
const PRIV = Buffer.from(PRIV_HEX.slice(2), "hex");
const PASSPHRASE = "correct horse battery staple";

jest.setTimeout(120_000);

describe("exportPrivateKey", () => {
  it("returns the exact key that was encrypted, in the format import-key accepts", async () => {
    const ks = await encryptKeystore(PRIV, PASSPHRASE, "secp256k1");
    const { privateKeyHex } = await exportPrivateKey(ks, PASSPHRASE);
    expect(privateKeyHex).toBe(PRIV_HEX);
    expect(privateKeyHex).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("reports the address that key controls", async () => {
    const ks = await encryptKeystore(PRIV, PASSPHRASE, "secp256k1");
    const { address } = await exportPrivateKey(ks, PASSPHRASE);
    expect(address).toBe(new Wallet(PRIV_HEX).address);
  });

  it("the exported key reproduces the same DID proof", async () => {
    // Round trip: key -> keystore -> export -> proof must match key -> proof.
    // Otherwise exporting would hand someone a key for a different identity.
    const ks = await encryptKeystore(PRIV, PASSPHRASE, "secp256k1");
    const { privateKeyHex } = await exportPrivateKey(ks, PASSPHRASE);
    expect(generateProof(privateKeyHex, "secp256k1")).toBe(
      generateProof(PRIV_HEX, "secp256k1"),
    );
  });

  it("opens keystores written by other tools (ethers / MetaMask)", async () => {
    const json = await new Wallet(PRIV_HEX).encrypt(PASSPHRASE);
    const { privateKeyHex } = await exportPrivateKey(json, PASSPHRASE);
    expect(privateKeyHex).toBe(PRIV_HEX);
  });

  it("refuses a wrong passphrase", async () => {
    const ks = await encryptKeystore(PRIV, PASSPHRASE, "secp256k1");
    await expect(exportPrivateKey(ks, "nope")).rejects.toThrow(
      WrongPassphraseError,
    );
  });

  it("output can be fed straight back into a signer", async () => {
    const ks = await encryptKeystore(PRIV, PASSPHRASE, "secp256k1");
    const { privateKeyHex, address } = await exportPrivateKey(ks, PASSPHRASE);
    const signer = LocalKeySigner.fromHex(privateKeyHex, "secp256k1");
    try {
      await expect(signer.getAddress()).resolves.toBe(address);
    } finally {
      signer.destroy();
    }
  });
});
