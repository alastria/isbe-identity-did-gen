import fs from "fs";
import path from "path";
 
const STORAGE_FILE = path.join(__dirname, "../.dids.json"); 
export interface DIDEntry {
  did: string;
  baseDocument: string;
  alsoKnownAs?: string;
  type: "root" | "child";
  createdAt: number;
  fragment?: string;
  publicKeyHex?: string;
  version?: number;
}
 
export function readDIDs(): DIDEntry[] {
  try {
    if (!fs.existsSync(STORAGE_FILE)) return [];
    const data = fs.readFileSync(STORAGE_FILE, "utf8");
    return JSON.parse(data) as DIDEntry[];
  } catch (e) {
    console.error("Error leyendo storage local:", e);
    return [];
  }
}
 
export function saveDID(entry: DIDEntry) {
  const dids = readDIDs();
  if (dids.find(d => d.did === entry.did)) return;
  dids.push(entry);
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(dids, null, 2), "utf8");
}
 
export function findDID(did: string): DIDEntry | undefined {
  return readDIDs().find(d => d.did === did);
}