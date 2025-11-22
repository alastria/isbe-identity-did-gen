import elliptic from "elliptic";
import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import { ethers } from "ethers";
import bs58 from "bs58";
 
const ec = new elliptic.ec("secp256k1");
const MODEL_DEPLOY_ID = "usecase-demo-01";

export function selfSign(privHex: string) {
  const key = ec.keyFromPrivate(privHex.replace(/^0x/, ""), "hex");
  const pubUncompressed = Buffer.from(key.getPublic().encode("hex", false), "hex"); 
  const pubXY = pubUncompressed.slice(1); // quitar 0x04 -> 64 bytes
  const msg = keccak_256(pubXY);
  const sig = key.sign(msg, { canonical: true });
  const r = sig.r.toArrayLike(Buffer, "be", 32);
  const s = sig.s.toArrayLike(Buffer, "be", 32);
  const v = (sig.recoveryParam ?? 0) + 27;
  const proof = ethers.concat([r, s, Uint8Array.from([v])]); 
  return { proof, signatureDER: Buffer.from(sig.toDER()), key };
}
 
export function buildDID(signatureDER: Buffer) {
  const last19 = signatureDER.slice(-19);
  const versionByte = Buffer.from([0x00]);
  const methodBytes = Buffer.concat([versionByte, last19]);
  const methodSpecificId = methodBytes.toString("hex");
  return `did:isbe:${MODEL_DEPLOY_ID}:${methodSpecificId}`;
}

export function fragmentFromDid(did: string) {
  return bs58.encode(Buffer.from(keccak_256(Buffer.from(did)).slice(0, 8)));
}
 

export function pubkeyToJWK(key: elliptic.ec.KeyPair) {
  const pub = key.getPublic();
  const x = Buffer.from(pub.getX().toArrayLike(Buffer, "be", 32)).toString("base64url");
  const y = Buffer.from(pub.getY().toArrayLike(Buffer, "be", 32)).toString("base64url");
  return JSON.stringify({ kty: "EC", crv: "secp256k1", x, y });
}

 
 