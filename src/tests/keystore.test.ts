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
import { mkdtempSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Wallet, Transaction } from "ethers";
import {
  assertKeystoreSupportsCurve,
  decryptKeystore,
  encryptKeystore,
  UnsupportedCurveError,
  WrongPassphraseError,
} from "../keystore";
import {
  createAndVerifyKeystoreFile,
  LocalKeySigner,
  readKeystoreFile,
  writeKeystoreFile,
} from "../signer";
import { generateProof, proofFromSigner } from "../commands/did";
import { generatePrivateKey } from "../commands/keys";
import { publicKeyToEOA } from "../utils";

const PRIV = Buffer.from(
  "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318",
  "hex",
);
const PASSPHRASE = "correct horse battery staple";

// scrypt at n=262144 is deliberately slow; that is the security property.
jest.setTimeout(120_000);

describe("keystore", () => {
  it("round-trips a secp256k1 key", async () => {
    const ks = await encryptKeystore(PRIV, PASSPHRASE, "secp256k1");
    const { privateKey, curve } = await decryptKeystore(ks, PASSPHRASE);
    expect(privateKey.toString("hex")).toBe(PRIV.toString("hex"));
    expect(curve).toBe("secp256k1");
  });

  it("writes a standard v3 file", async () => {
    const ks = JSON.parse(await encryptKeystore(PRIV, PASSPHRASE, "secp256k1"));
    expect(ks.version).toBe(3);
    const section = ks.crypto ?? ks.Crypto;
    expect(section.kdf).toBe("scrypt");
    expect(section.cipher).toBe("aes-128-ctr");
    // Work factor must not silently fall back to the library default, which
    // is half this. It is what makes an offline guess expensive.
    expect(section.kdfparams.n).toBe(262144);
  });

  it("rejects a wrong passphrase with a typed error", async () => {
    const ks = await encryptKeystore(PRIV, PASSPHRASE, "secp256k1");
    await expect(decryptKeystore(ks, "not the passphrase")).rejects.toThrow(
      WrongPassphraseError,
    );
  });

  it("detects a tampered ciphertext", async () => {
    const ks = JSON.parse(await encryptKeystore(PRIV, PASSPHRASE, "secp256k1"));
    const section = ks.crypto ?? ks.Crypto;
    section.ciphertext =
      section.ciphertext.slice(0, -2) +
      (section.ciphertext.endsWith("ff") ? "00" : "ff");
    await expect(decryptKeystore(ks, PASSPHRASE)).rejects.toThrow();
  });

  it("produces a different file each time for the same key", async () => {
    const a = JSON.parse(await encryptKeystore(PRIV, PASSPHRASE, "secp256k1"));
    const b = JSON.parse(await encryptKeystore(PRIV, PASSPHRASE, "secp256k1"));
    const sa = a.crypto ?? a.Crypto;
    const sb = b.crypto ?? b.Crypto;
    expect(sa.ciphertext).not.toBe(sb.ciphertext);
    expect(sa.kdfparams.salt).not.toBe(sb.kdfparams.salt);
  });

  it("refuses a key that is not 32 bytes", async () => {
    await expect(
      encryptKeystore(Buffer.alloc(16), PASSPHRASE, "secp256k1"),
    ).rejects.toThrow(/expected 32 bytes/);
  });

  it("rejects things that are not keystores", async () => {
    await expect(decryptKeystore({ version: 1 }, PASSPHRASE)).rejects.toThrow(
      /Web3 Secret Storage/,
    );
    await expect(decryptKeystore(null, PASSPHRASE)).rejects.toThrow();
  });

  describe("curve support", () => {
    it("refuses to store a P-256 key instead of mislabelling it", async () => {
      // The v3 format has no field for a curve and ethers derives a
      // secp256k1 address, so a P-256 keystore would claim an address that
      // is not the key's. Failing loudly is the honest option.
      await expect(
        encryptKeystore(PRIV, PASSPHRASE, "P-256"),
      ).rejects.toThrow(UnsupportedCurveError);
      expect(() => assertKeystoreSupportsCurve("P-256")).toThrow(
        /Bare Network/,
      );
    });

    it("allows secp256k1", () => {
      expect(() => assertKeystoreSupportsCurve("secp256k1")).not.toThrow();
    });
  });

  describe("interoperability with ethers / geth / MetaMask", () => {
    it("a keystore we write can be opened by ethers", async () => {
      const ks = await encryptKeystore(PRIV, PASSPHRASE, "secp256k1");
      const wallet = await Wallet.fromEncryptedJson(ks, PASSPHRASE);
      expect(wallet.privateKey).toBe("0x" + PRIV.toString("hex"));
    });

    it("a keystore written by ethers can be opened by us", async () => {
      const json = await new Wallet("0x" + PRIV.toString("hex")).encrypt(
        PASSPHRASE,
      );
      const { privateKey } = await decryptKeystore(JSON.parse(json), PASSPHRASE);
      expect(privateKey.toString("hex")).toBe(PRIV.toString("hex"));
    });
  });

  describe("file handling", () => {
    it("writes with mode 0600 and refuses to clobber", async () => {
      const dir = mkdtempSync(join(tmpdir(), "did-gen-"));
      const path = join(dir, "id.keystore.json");
      const ks = await encryptKeystore(PRIV, PASSPHRASE, "secp256k1");

      writeKeystoreFile(path, ks);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      // Overwriting a keystore destroys an identity; it must never happen.
      expect(() => writeKeystoreFile(path, ks)).toThrow();

      const { privateKey } = await decryptKeystore(
        readKeystoreFile(path),
        PASSPHRASE,
      );
      expect(privateKey.toString("hex")).toBe(PRIV.toString("hex"));
    });

    it("gives a clear error for a missing file", () => {
      expect(() => readKeystoreFile("/nonexistent/x.json")).toThrow(
        /Keystore not found/,
      );
    });
  });
});

describe("LocalKeySigner", () => {
  it("produces the same proof as the raw-key path", () => {
    const signer = new LocalKeySigner(PRIV, "secp256k1");
    try {
      expect(proofFromSigner(signer)).toBe(
        generateProof("0x" + PRIV.toString("hex"), "secp256k1"),
      );
    } finally {
      signer.destroy();
    }
  });

  it("copies the key so the caller can wipe its own buffer", () => {
    const owned = Buffer.from(PRIV);
    const signer = new LocalKeySigner(owned, "secp256k1");
    owned.fill(0);
    try {
      expect(proofFromSigner(signer)).toBe(
        generateProof("0x" + PRIV.toString("hex"), "secp256k1"),
      );
    } finally {
      signer.destroy();
    }
  });

  it("is unusable after destroy()", () => {
    const signer = new LocalKeySigner(PRIV, "secp256k1");
    signer.destroy();
    expect(() => signer.signDigest(Buffer.alloc(32))).toThrow(/destroyed/);
  });

  it("destroy() is idempotent", () => {
    const signer = new LocalKeySigner(PRIV, "secp256k1");
    signer.destroy();
    expect(() => signer.destroy()).not.toThrow();
  });

  it("refuses a digest that is not 32 bytes", () => {
    const signer = new LocalKeySigner(PRIV, "secp256k1");
    try {
      expect(() => signer.signDigest(Buffer.alloc(31))).toThrow(/32 bytes/);
    } finally {
      signer.destroy();
    }
  });

  describe("signTransaction", () => {
    const TX = {
      to: "0x00000000000000000000000000000000000015BE",
      data: "0xdeadbeef",
      nonce: 3,
      gasLimit: 200000n,
      gasPrice: 0n,
      chainId: 1337n,
      value: 0n,
    };

    it("matches what ethers would sign", async () => {
      const signer = new LocalKeySigner(PRIV, "secp256k1");
      try {
        const ours = await signer.signTransaction(TX);
        const theirs = await new Wallet(
          "0x" + PRIV.toString("hex"),
        ).signTransaction(TX);
        expect(ours).toBe(theirs);
      } finally {
        signer.destroy();
      }
    });

    it("recovers to the signer's own address", async () => {
      const signer = new LocalKeySigner(PRIV, "secp256k1");
      try {
        const raw = await signer.signTransaction(TX);
        expect(Transaction.from(raw).from).toBe(await signer.getAddress());
      } finally {
        signer.destroy();
      }
    });

    it("refuses P-256 with an explanation rather than a wrong signature", async () => {
      const signer = new LocalKeySigner(PRIV, "P-256");
      try {
        await expect(signer.signTransaction(TX)).rejects.toThrow(
          /only implemented for secp256k1/,
        );
      } finally {
        signer.destroy();
      }
    });
  });
});

describe("generatePrivateKey", () => {
  it("returns 32 usable bytes", () => {
    for (const curve of ["secp256k1", "P-256"] as const) {
      const key = generatePrivateKey(curve);
      expect(key).toHaveLength(32);
      expect(key.every((b) => b === 0)).toBe(false);
      expect(() => new LocalKeySigner(key, curve)).not.toThrow();
    }
  });

  it("does not repeat", () => {
    const seen = new Set(
      Array.from({ length: 16 }, () =>
        generatePrivateKey("secp256k1").toString("hex"),
      ),
    );
    expect(seen.size).toBe(16);
  });
});

describe("createAndVerifyKeystoreFile", () => {
  const OPTS = { passphraseStdin: false } as const;

  function withPassphraseFromEnv<T>(fn: () => Promise<T>): Promise<T> {
    process.env.ISBE_KEYSTORE_PASSPHRASE = PASSPHRASE;
    return fn().finally(() => {
      delete process.env.ISBE_KEYSTORE_PASSPHRASE;
    });
  }

  it("writes a keystore that decrypts back to the same key", async () => {
    const dir = mkdtempSync(join(tmpdir(), "did-gen-import-"));
    const path = join(dir, "imported.keystore.json");

    await withPassphraseFromEnv(() =>
      createAndVerifyKeystoreFile(PRIV, "secp256k1", OPTS, path),
    );

    expect(statSync(path).mode & 0o777).toBe(0o600);
    const { privateKey, curve } = await decryptKeystore(
      readFileSync(path, "utf8"),
      PASSPHRASE,
    );
    expect(privateKey.toString("hex")).toBe(PRIV.toString("hex"));
    expect(curve).toBe("secp256k1");
  });

  it("an imported key reproduces the identity it came from", async () => {
    const dir = mkdtempSync(join(tmpdir(), "did-gen-import-"));
    const path = join(dir, "imported.keystore.json");

    // The DID derived before importing must survive the round trip, or the
    // migration would silently produce a different identity.
    const before = generateProof("0x" + PRIV.toString("hex"), "secp256k1");

    await withPassphraseFromEnv(() =>
      createAndVerifyKeystoreFile(PRIV, "secp256k1", OPTS, path),
    );

    const { privateKey, curve } = await decryptKeystore(
      readFileSync(path, "utf8"),
      PASSPHRASE,
    );
    const signer = new LocalKeySigner(privateKey, curve);
    try {
      expect(proofFromSigner(signer)).toBe(before);
    } finally {
      signer.destroy();
    }
  });

  it("refuses a P-256 key rather than writing a mislabelled file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "did-gen-import-"));
    const path = join(dir, "p256.keystore.json");

    await expect(
      withPassphraseFromEnv(() =>
        createAndVerifyKeystoreFile(PRIV, "P-256", OPTS, path),
      ),
    ).rejects.toThrow(UnsupportedCurveError);
  });

  it("refuses to overwrite an existing keystore", async () => {
    const dir = mkdtempSync(join(tmpdir(), "did-gen-import-"));
    const path = join(dir, "once.keystore.json");

    await withPassphraseFromEnv(() =>
      createAndVerifyKeystoreFile(PRIV, "secp256k1", OPTS, path),
    );
    await expect(
      withPassphraseFromEnv(() =>
        createAndVerifyKeystoreFile(PRIV, "secp256k1", OPTS, path),
      ),
    ).rejects.toThrow();
  });
});
