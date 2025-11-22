import { JsonRpcProvider, Contract } from "ethers";
import dotenv from "dotenv";
dotenv.config();
 
const RPC = process.env.RPC_URL || "http://127.0.0.1:8545";
const REG = process.env.DID_REGISTRY_ADDRESS;
if (!REG) throw new Error("0x9A9f2CCfdE556A7E9Ff0848998Aa4a0CFD8863AE");
 
const provider = new JsonRpcProvider(RPC);
const address = REG;
 
const tryFns = [
  { name: "owner", abi: ["function owner() view returns (address)"] },
  { name: "getOwner", abi: ["function getOwner() view returns (address)"] },
  { name: "admin", abi: ["function admin() view returns (address)"] },
  { name: "getAdmin", abi: ["function getAdmin() view returns (address)"] },
  { name: "controller", abi: ["function controller() view returns (address)"] },
  { name: "getController", abi: ["function getController() view returns (address)"] },
];
 
(async () => {
  console.log("Comprobando getters comunes de owner/admin en", address);
  for (const f of tryFns) {
    try {
      const c = new Contract(address, f.abi, provider);
      const res = await (c as any)[f.name]();
      if (res) {
        console.log(`→ Encontrado ${f.name}() = ${res}`);
      }
    } catch (e: any) {
    }
  }
  console.log("\n.");
  process.exit(0);
})();