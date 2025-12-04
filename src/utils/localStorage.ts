import fs from "fs";
import path from "path";

const STORAGE_FILE = path.join(__dirname, "../.dids.json");
 
export interface DIDEntry {
  did: string;
  type: "root" | "child";
  owner: string;
  alsoKnownAs?: string;
  baseDocument?: any;
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

export function saveDIDEntry(
  did: string,
  type: "root" | "child",
  owner: string,
  alsoKnownAs?: string,
  baseDocument?: any
) {
  const list = readDIDs();
  const existingIndex = list.findIndex((d) => d.did === did);
  const newEntry: DIDEntry = {
    did,
    type,
    owner,
    alsoKnownAs,
    baseDocument,
    createdAt: Date.now()
  };
  if (existingIndex >= 0) {
    list[existingIndex] = { ...list[existingIndex], ...newEntry };
  } else {
    list.push(newEntry);
  }
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(list, null, 2), "utf8");
}

export function saveDID(entry: DIDEntry) {
  saveDIDEntry(
    entry.did,
    entry.type,
    entry.owner,
    entry.alsoKnownAs,
    entry.baseDocument
  );
}
 

export function findDID(did: string): DIDEntry | undefined {
  return readDIDs().find((d) => d.did === did);
}

export function updateDIDAliasLocal(did: string, newAlias: string): void {
  const dids = readDIDs();
  if (!dids || dids.length === 0) {
    console.warn("updateDIDAliasLocal: no hay DIDs en storage local.");
    return;
  }
 
  let found = false;
  const updated = dids.map((entry: any) => {
    if (entry.did === did) {
      found = true;
      return {
        ...entry,
        alsoKnownAs: newAlias, 
      };
    }
    return entry;
  });
 
  if (!found) {
    console.warn(
      `updateDIDAliasLocal: DID ${did} no se encontró en .dids.json (no se modificó nada).`
    );
    return;
  }
 
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(updated, null, 2), "utf8");
    console.log("Alias actualizado en storage local (.dids.json).");
  } catch (e) {
    console.error("Error escribiendo .dids.json en updateDIDAliasLocal:", e);
  }
}
export function updateDIDBaseLocal(did: string, newBaseDocument: string): void {
  const dids = readDIDs();
  if (!dids || dids.length === 0) {
    console.warn("updateDIDBaseLocal: no hay DIDs en storage local.");
    return;
  }
  let found = false;
  const updated = dids.map((entry: any) => {
    if (entry.did === did) {
      found = true;
      return {
        ...entry,
        baseDocument: newBaseDocument,
        createdAt: Date.now(), 
      };
    }
    return entry;
  });
   if (!found) {
    console.warn(
      `updateDIDBaseLocal: DID ${did} no se encontró en .dids.json (no se modificó nada).`
    );
    return;
  }
   try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(updated, null, 2), "utf8");
    console.log("baseDocument actualizado en storage local (.dids.json).");
  } catch (e) {
    console.error("Error escribiendo .dids.json en updateDIDBaseLocal:", e);
  }
}
 