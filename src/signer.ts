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
 * Everything that needs the private key goes through `Signer`, so the key
 * itself stays behind one interface. Adding a hardware wallet, an HSM or the
 * macOS Keychain later means adding an implementation here, not changing the
 * commands.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { Transaction, TransactionLike } from "ethers";
import { AcceptedCurves } from "./types";
import { getEc, normalizePrivKey, publicKeyToEOA, wipe } from "./utils";
import {
  assertKeystoreSupportsCurve,
  decryptKeystore,
  encryptKeystore,
} from "./keystore";
import {
  PASSPHRASE_ENV,
  PassphraseOptions,
  promptPrivateKey,
  readStdin,
  resolveNewPassphrase,
  resolvePassphrase,
} from "./prompt";

export type RawSignature = { r: Buffer; s: Buffer; v: number };

export interface Signer {
  readonly curve: AcceptedCurves;
  /** Uncompressed public key, `0x04 || X || Y`. */
  getPublicKey(): string;
  /** EOA with EIP-55 checksum. */
  getAddress(): Promise<string>;
  /**
   * Raw ECDSA over an already-computed 32-byte digest.
   *
   * Deliberately NOT an EIP-191 personal_sign: the registry verifies the
   * proof with `ecrecover(keccak256(publicKey), ...)` and any message prefix
   * would make the recovered address wrong.
   */
  signDigest(digest: Uint8Array): RawSignature;
  /** Signs an EVM transaction and returns the raw signed payload. */
  signTransaction(tx: TransactionLike): Promise<string>;
  /** Wipes key material held in memory. */
  destroy(): void;
}

/**
 * A signer backed by private key bytes held in this process.
 *
 * Used for every local backend: the keystore decrypts into one of these, and
 * so do the stdin and (deprecated) argv paths.
 */
export class LocalKeySigner implements Signer {
  readonly curve: AcceptedCurves;
  #privateKey: Buffer | null;
  #publicKey: string;

  constructor(privateKey: Buffer, curve: AcceptedCurves) {
    if (privateKey.length !== 32) {
      throw new Error(
        `Invalid private key length: expected 32 bytes, got ${privateKey.length}`,
      );
    }
    this.curve = curve;
    // Copy: the caller keeps ownership of its buffer and may wipe it right
    // after constructing the signer.
    this.#privateKey = Buffer.from(privateKey);
    const key = getEc(curve).keyFromPrivate(this.#privateKey);
    if (key.getPrivate().isZero()) {
      throw new Error("Invalid private key: zero is not a valid scalar.");
    }
    this.#publicKey = "0x" + key.getPublic().encode("hex", false);
  }

  static fromHex(privHex: string, curve: AcceptedCurves): LocalKeySigner {
    return new LocalKeySigner(
      Buffer.from(normalizePrivKey(privHex), "hex"),
      curve,
    );
  }

  #key() {
    if (this.#privateKey === null) {
      throw new Error("Signer has been destroyed; its key is no longer in memory.");
    }
    return getEc(this.curve).keyFromPrivate(this.#privateKey);
  }

  getPublicKey(): string {
    return this.#publicKey;
  }

  async getAddress(): Promise<string> {
    return await publicKeyToEOA(this.#publicKey);
  }

  signDigest(digest: Uint8Array): RawSignature {
    if (digest.length !== 32) {
      throw new Error(
        `Digest must be 32 bytes, got ${digest.length}. Hash the message first.`,
      );
    }
    const sig = this.#key().sign(digest, { canonical: true });
    return {
      r: sig.r.toArrayLike(Buffer, "be", 32),
      s: sig.s.toArrayLike(Buffer, "be", 32),
      v: (sig.recoveryParam ?? 0) + 27,
    };
  }

  async signTransaction(txLike: TransactionLike): Promise<string> {
    if (this.curve !== "secp256k1") {
      throw new Error(
        "Transaction signing is only implemented for secp256k1 (Case Network).\n" +
          "The Bare Network uses P-256, which ethers cannot sign; that path is not wired up yet.",
      );
    }

    const tx = Transaction.from({ ...txLike, from: undefined, signature: null });
    const digest = Buffer.from(tx.unsignedHash.slice(2), "hex");
    const { r, s, v } = this.signDigest(digest);

    tx.signature = {
      r: "0x" + r.toString("hex"),
      s: "0x" + s.toString("hex"),
      // ethers wants the parity, not the legacy 27/28 offset.
      v: v - 27,
    };

    const expected = await this.getAddress();
    if (tx.from?.toLowerCase() !== expected.toLowerCase()) {
      throw new Error(
        `Signed transaction recovers to ${tx.from}, expected ${expected}. Refusing to emit it.`,
      );
    }
    return tx.serialized;
  }

  destroy(): void {
    if (this.#privateKey !== null) {
      wipe(this.#privateKey);
      this.#privateKey = null;
    }
  }
}

/* ------------------------------- Keystore I/O ------------------------------- */

export function writeKeystoreFile(path: string, keystoreJson: string): void {
  // 0o600 from the start: never briefly world-readable.
  // 'wx' refuses to overwrite - clobbering a keystore destroys an identity.
  writeFileSync(path, JSON.stringify(JSON.parse(keystoreJson), null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
}

export function readKeystoreFile(path: string): string {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") throw new Error(`Keystore not found: ${path}`);
    throw err;
  }
  try {
    JSON.parse(raw);
  } catch {
    throw new Error(`Keystore is not valid JSON: ${path}`);
  }
  return raw;
}

export async function createKeystore(
  privateKey: Buffer,
  curve: AcceptedCurves,
  opts: PassphraseOptions,
): Promise<string> {
  // Checked before the passphrase prompt: no point asking for one only to
  // fail on the curve afterwards.
  assertKeystoreSupportsCurve(curve);
  const passphrase = await resolveNewPassphrase(opts);
  return await encryptKeystore(privateKey, passphrase, curve);
}

/**
 * Encrypts a key to a new file and proves the file opens again before
 * returning.
 *
 * Used when importing an existing key, where an unreadable keystore means a
 * lost identity rather than a regenerable one. Costs a second scrypt pass,
 * which is the right trade for a one-off migration.
 */
export async function createAndVerifyKeystoreFile(
  privateKey: Buffer,
  curve: AcceptedCurves,
  opts: PassphraseOptions,
  path: string,
): Promise<string> {
  assertKeystoreSupportsCurve(curve);
  const passphrase = await resolveNewPassphrase(opts);
  const keystore = await encryptKeystore(privateKey, passphrase, curve);
  writeKeystoreFile(path, keystore);

  const readBack = await decryptKeystore(readKeystoreFile(path), passphrase);
  try {
    if (
      readBack.privateKey.length !== privateKey.length ||
      !timingSafeEqual(readBack.privateKey, privateKey)
    ) {
      throw new Error(
        `Keystore written to ${path} does not decrypt back to the same key. Do not rely on it.`,
      );
    }
    if (readBack.curve !== curve) {
      throw new Error(
        `Keystore written to ${path} reports curve ${readBack.curve}, expected ${curve}.`,
      );
    }
  } finally {
    wipe(readBack.privateKey);
  }
  return keystore;
}

/**
 * Reads a raw private key for import, preferring sources that stay off the
 * command line. Falls back to an interactive prompt rather than to argv.
 */
export async function resolveRawPrivateKey(
  opts: PassphraseOptions & { privKeyStdin?: boolean; privKey?: string },
  warn: (message: string) => void,
): Promise<Buffer> {
  if (opts.privKeyStdin && opts.privKey) {
    throw new Error("Pass either --priv-key-stdin or --privKey, not both.");
  }
  // stdin is a single stream: the key and the passphrase cannot both come
  // from it. Say so here rather than letting one silently eat the other.
  if (opts.privKeyStdin && (opts as PassphraseOptions).passphraseStdin) {
    throw new Error(
      "--priv-key-stdin and --passphrase-stdin both read stdin. " +
        `Keep --priv-key-stdin and pass the passphrase in ${PASSPHRASE_ENV}, or drop one flag and be prompted.`,
    );
  }

  let hex: string;
  if (opts.privKeyStdin) {
    hex = (await readStdin()).trim();
  } else if (opts.privKey) {
    warn(ARGV_KEY_WARNING);
    hex = opts.privKey;
  } else {
    hex = (await promptPrivateKey()).trim();
  }

  return Buffer.from(normalizePrivKey(hex), "hex");
}

/* ------------------------------ Signer resolution ---------------------------- */

export type SignerOptions = PassphraseOptions & {
  keystore?: string;
  privKeyStdin?: boolean;
  /** @deprecated Leaks the key into argv, shell history and `ps`. */
  privKey?: string;
  curve: AcceptedCurves;
};

export const ARGV_KEY_WARNING =
  "--privKey is deprecated: the key is recorded in your shell history and is " +
  "visible to any process via `ps`. Use --keystore instead.";

/**
 * Builds a signer from the CLI options, preferring the safe sources.
 *
 * The curve comes from the keystore when there is one, because the file knows
 * which curve its key belongs to and the flag is only a default.
 */
export async function resolveSigner(
  opts: SignerOptions,
  warn: (message: string) => void,
): Promise<Signer> {
  const sources = [
    opts.keystore ? "keystore" : null,
    opts.privKeyStdin ? "stdin" : null,
    opts.privKey ? "argv" : null,
  ].filter(Boolean);

  if (sources.length === 0) {
    throw new Error(
      "No key source given. Use --keystore <file> (recommended) or --priv-key-stdin.",
    );
  }
  if (sources.length > 1) {
    throw new Error(
      `Multiple key sources given (${sources.join(", ")}). Pick one.`,
    );
  }

  if (opts.keystore) {
    const keystore = readKeystoreFile(opts.keystore);
    const passphrase = await resolvePassphrase(opts);
    const { privateKey, curve } = await decryptKeystore(keystore, passphrase);
    if (opts.curve && curve !== opts.curve) {
      warn(
        `Keystore holds a ${curve} key; ignoring --curve ${opts.curve}.`,
      );
    }
    try {
      return new LocalKeySigner(privateKey, curve);
    } finally {
      wipe(privateKey);
    }
  }

  if (opts.privKeyStdin) {
    const hex = await readStdin();
    return LocalKeySigner.fromHex(hex.trim(), opts.curve);
  }

  warn(ARGV_KEY_WARNING);
  return LocalKeySigner.fromHex(opts.privKey!, opts.curve);
}
