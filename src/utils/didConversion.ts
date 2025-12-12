import { ethers } from "ethers";

// Aplica keccak256 al DID string completo, tal como lo hace el script de diagnóstico
export function didToBytes32(did: string): string {
  if (!did || typeof did !== "string") {
    throw new Error("didToBytes32: DID inválido");
  }
  return ethers.keccak256(ethers.toUtf8Bytes(did));
}
