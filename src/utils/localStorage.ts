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
 
/* -------------------------------------------------------------------------- */

/*                                   LECTURA                                   */

/* -------------------------------------------------------------------------- */
 
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
 
/* -------------------------------------------------------------------------- */

/*                                GUARDAR/UPDATE                               */

/* -------------------------------------------------------------------------- */
 
/**

* saveDIDEntry → Esta es la función que tu CLI espera.

* Guarda o actualiza un DID con la información mínima necesaria.

*/

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

    // Actualiza el existente

    list[existingIndex] = { ...list[existingIndex], ...newEntry };

  } else {

    // Agrega uno nuevo

    list.push(newEntry);

  }
 
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(list, null, 2), "utf8");

}
 
/**

* saveDID (versión vieja)

* → Lo mantenemos por compatibilidad.

* → Simplemente llama internamente a saveDIDEntry.

*/

export function saveDID(entry: DIDEntry) {

  saveDIDEntry(

    entry.did,

    entry.type,

    entry.owner,

    entry.alsoKnownAs,

    entry.baseDocument

  );

}
 
/* -------------------------------------------------------------------------- */

/*                                  BÚSQUEDA                                  */

/* -------------------------------------------------------------------------- */
 
export function findDID(did: string): DIDEntry | undefined {

  return readDIDs().find((d) => d.did === did);

}

 