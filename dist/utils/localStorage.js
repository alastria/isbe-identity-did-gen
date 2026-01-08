"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readDIDs = readDIDs;
exports.saveDIDEntry = saveDIDEntry;
exports.saveDID = saveDID;
exports.findDID = findDID;
exports.updateDIDAliasLocal = updateDIDAliasLocal;
exports.updateDIDBaseLocal = updateDIDBaseLocal;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const STORAGE_FILE = path_1.default.join(__dirname, "../.dids.json");
function readDIDs() {
    try {
        if (!fs_1.default.existsSync(STORAGE_FILE))
            return [];
        const data = fs_1.default.readFileSync(STORAGE_FILE, "utf8");
        return JSON.parse(data);
    }
    catch (e) {
        console.error("Error leyendo storage local:", e);
        return [];
    }
}
function saveDIDEntry(did, type, owner, alsoKnownAs, baseDocument) {
    const list = readDIDs();
    const existingIndex = list.findIndex((d) => d.did === did);
    const newEntry = {
        did,
        type,
        owner,
        alsoKnownAs,
        baseDocument,
        createdAt: Date.now()
    };
    if (existingIndex >= 0) {
        list[existingIndex] = { ...list[existingIndex], ...newEntry };
    }
    else {
        list.push(newEntry);
    }
    fs_1.default.writeFileSync(STORAGE_FILE, JSON.stringify(list, null, 2), "utf8");
}
function saveDID(entry) {
    saveDIDEntry(entry.did, entry.type, entry.owner, entry.alsoKnownAs, entry.baseDocument);
}
function findDID(did) {
    return readDIDs().find((d) => d.did === did);
}
function updateDIDAliasLocal(did, newAlias) {
    const dids = readDIDs();
    if (!dids || dids.length === 0) {
        console.warn("updateDIDAliasLocal: no hay DIDs en storage local.");
        return;
    }
    let found = false;
    const updated = dids.map((entry) => {
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
        console.warn(`updateDIDAliasLocal: DID ${did} no se encontró en .dids.json (no se modificó nada).`);
        return;
    }
    try {
        fs_1.default.writeFileSync(STORAGE_FILE, JSON.stringify(updated, null, 2), "utf8");
        console.log("Alias actualizado en storage local (.dids.json).");
    }
    catch (e) {
        console.error("Error escribiendo .dids.json en updateDIDAliasLocal:", e);
    }
}
function updateDIDBaseLocal(did, newBaseDocument) {
    const dids = readDIDs();
    if (!dids || dids.length === 0) {
        console.warn("updateDIDBaseLocal: no hay DIDs en storage local.");
        return;
    }
    let found = false;
    const updated = dids.map((entry) => {
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
        console.warn(`updateDIDBaseLocal: DID ${did} no se encontró en .dids.json (no se modificó nada).`);
        return;
    }
    try {
        fs_1.default.writeFileSync(STORAGE_FILE, JSON.stringify(updated, null, 2), "utf8");
        console.log("baseDocument actualizado en storage local (.dids.json).");
    }
    catch (e) {
        console.error("Error escribiendo .dids.json en updateDIDBaseLocal:", e);
    }
}
