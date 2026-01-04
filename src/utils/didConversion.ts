import { ethers } from "ethers";

export function didToBytes32(did: string): string {
  if (!did || typeof did !== "string") {
    throw new Error("didToBytes32: DID inválido");
  }
  return ethers.keccak256(ethers.toUtf8Bytes(did));
}
