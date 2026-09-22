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
 * Golden-vector compatibility suite.
 *
 * These vectors were captured from the pre-keystore implementation (v2.1.0)
 * BEFORE any refactor. They are the contract with identities already
 * registered on-chain: the DID is derived from the proof, and
 * `DidDocumentDetailedInternal._validateProof` re-checks that derivation on
 * every insert. If any value here changes, DIDs minted by the new code will
 * not match DIDs minted by the old code.
 *
 * Do not regenerate this fixture to make a failing test pass.
 */

import bs58 from "bs58";
import vectors from "./fixtures/golden-vectors.json";
import { buildDID, generateProof } from "../commands/did";
import {
  calculateJwkThumbprint,
  getEc,
  getPublicKey,
  jwkToEoa,
  publicKeyToEOA,
  stringToHex,
  toJwk,
} from "../utils";
import { AcceptedCurves, EcPublicJwk } from "../types";

type Vector = {
  curve: AcceptedCurves;
  privateKey: string;
  proof: string;
  publicKey: string;
  eoa: string;
  jwkEoa: string;
  publicJwk: EcPublicJwk;
  thumbprint: string;
  pkHexOfJwk: string;
  dids: Record<string, string>;
};

const VECTORS = vectors as unknown as Vector[];

describe("golden vectors (compatibility with v2.1.0)", () => {
  it("fixture covers both curves", () => {
    expect(VECTORS.length).toBeGreaterThan(0);
    expect(VECTORS.some((v) => v.curve === "secp256k1")).toBe(true);
    expect(VECTORS.some((v) => v.curve === "P-256")).toBe(true);
  });

  describe.each(
    VECTORS.map((v) => [v.curve, v.privateKey.slice(0, 10), v] as const),
  )("%s %s", (_curve, _label, v) => {
    it("produces the recorded proof", () => {
      expect(generateProof(v.privateKey, v.curve)).toBe(v.proof);
    });

    it("proof is deterministic across invocations (RFC 6979)", () => {
      expect(generateProof(v.privateKey, v.curve)).toBe(
        generateProof(v.privateKey, v.curve),
      );
    });

    it("proof is 65 bytes with a valid recovery byte", () => {
      const raw = v.proof.replace(/^0x/, "");
      expect(raw).toHaveLength(130);
      expect([27, 28]).toContain(parseInt(raw.slice(128), 16));
    });

    it("accepts the private key without the 0x prefix", () => {
      expect(generateProof(v.privateKey.slice(2), v.curve)).toBe(v.proof);
    });

    it("produces the recorded uncompressed public key", () => {
      expect(getPublicKey(v.privateKey, v.curve)).toBe(v.publicKey);
    });

    it("produces the recorded EOA with EIP-55 checksum", async () => {
      await expect(publicKeyToEOA(v.publicKey)).resolves.toBe(v.eoa);
    });

    it("derives the same EOA from the public JWK", async () => {
      await expect(jwkToEoa(v.publicJwk)).resolves.toBe(v.jwkEoa);
      expect(v.jwkEoa).toBe(v.eoa);
    });

    it("produces the recorded JWK thumbprint (vMethodId)", async () => {
      await expect(calculateJwkThumbprint(v.publicJwk)).resolves.toBe(
        v.thumbprint,
      );
    });

    it("produces the recorded public JWK", () => {
      const key = getEc(v.curve).keyFromPrivate(
        v.privateKey.replace(/^0x/, ""),
        "hex",
      );
      const { d: _d, ...publicJwk } = toJwk(key, v.curve);
      expect(publicJwk).toEqual(v.publicJwk);
    });

    it("produces the recorded hex encoding of the public JWK", () => {
      expect(stringToHex(JSON.stringify(v.publicJwk))).toBe(v.pkHexOfJwk);
    });

    it.each(Object.entries(v.dids))(
      "builds the recorded DID for modelDeploy %s",
      (modelDeploy, expected) => {
        expect(buildDID(v.proof, modelDeploy)).toBe(expected);
      },
    );
  });
});

describe("DID layout required by DidDocumentDetailedInternal._validateProof", () => {
  it.each(VECTORS.map((v) => [v.curve, v] as const))(
    "%s: version byte 0x00 followed by the last 19 bytes of the proof",
    (_curve, v) => {
      const did = buildDID(v.proof, "uc");
      const methodSpecificId = did.split(":")[3];
      expect(methodSpecificId.startsWith("z")).toBe(true);

      const decoded = Buffer.from(bs58.decode(methodSpecificId.slice(1)));
      expect(decoded).toHaveLength(20);
      expect(decoded[0]).toBe(0x00);

      const proofBytes = Buffer.from(v.proof.replace(/^0x/, ""), "hex");
      expect(decoded.subarray(1)).toEqual(proofBytes.subarray(-19));
    },
  );
});

describe("private key validation", () => {
  it.each([
    ["empty", ""],
    ["too short", "0x1234"],
    ["too long", "0x" + "1".repeat(65)],
    ["non-hex", "0x" + "z".repeat(64)],
  ])("rejects a key that is %s", (_label, badKey) => {
    expect(() => generateProof(badKey, "secp256k1")).toThrow(
      /Invalid private key format/,
    );
  });
});
