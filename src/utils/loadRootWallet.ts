import fs from "fs";
import { Wallet } from "ethers";

export function loadRootWallet(provider: any) {
  if (!fs.existsSync(".did_root")) {
    throw new Error(" No existe archivo .did_root. Debes crear un root DID primero.");
  }
  const env = fs.readFileSync(".did_root", "utf8");
  const lines = env.split("\n");
  const privLine = lines.find(l => l.startsWith("PRIVATE_KEY="));
 
  if (!privLine) {
    throw new Error(" .did_root no contiene PRIVATE_KEY");
  }
  const privateKey = privLine.replace("PRIVATE_KEY=", "").trim();
  return new Wallet(privateKey, provider);
}

 