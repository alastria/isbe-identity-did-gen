import fs from "node:fs";
import path from "node:path";
import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import elliptic from "elliptic";


const args = process.argv.slice(2);
const fileFlagIndex = args.indexOf("--file");
if (fileFlagIndex === -1 || !args[fileFlagIndex + 1]) {
  console.error("Debes indicar el archivo con --file <ruta>");
  console.error("Ejemplo: node scripts/verify-crypto.mjs --file out.json");
  process.exit(1);
}
const filePath = args[fileFlagIndex + 1];
const resolvedPath = path.resolve(process.cwd(), filePath);

if (!fs.existsSync(resolvedPath)) {
  console.error(` El archivo no existe: ${resolvedPath}`);
  process.exit(1);
}

const o = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
const curveName = o.ellipticType === 2 ? "p256" : "secp256k1";
const ec = new elliptic.ec(curveName);

function section(title) {
  console.log(`\n══════════════════════════════════════`);
  console.log(` ${title}`);
  console.log(`══════════════════════════════════════\n`);
}
function ok(label, value) {
  console.log(`${label}${value !== undefined ? `: ${value}` : ""}`);
}

section(`VERIFY CRYPTO — ${filePath} (${curveName})`);

const pubXY = Buffer.from(String(o.publicKeyHex).replace(/^0x/, ""), "hex");
if (pubXY.length !== 64) throw new Error(`publicKeyHex debe ser 64 bytes, obtenido ${pubXY.length}`);

const x = pubXY.subarray(0, 32);
const y = pubXY.subarray(32, 64);

const msgHash = Buffer.from(keccak_256(Buffer.concat([x, y])));
const msgHashHex = "0x" + msgHash.toString("hex");

if (msgHashHex.toLowerCase() !== String(o.hashToSign).toLowerCase()) {
  throw new Error("hashToSign no coincide con keccak256(X||Y)");
}
ok("hashToSign coincide con keccak256(X||Y)", msgHashHex);

const sigBytes = Buffer.from(String(o.proofRsv).replace(/^0x/, ""), "hex");
if (sigBytes.length !== 65) throw new Error(`proofRsv debe ser 65 bytes, obtenido ${sigBytes.length}`);

const v = sigBytes[64];
if (v !== 27 && v !== 28) throw new Error(`v inválido: ${v} (esperado 27/28)`);
ok("v válido (27/28)", v);

const r = sigBytes.subarray(0, 32);
const s = sigBytes.subarray(32, 64);

const key = ec.keyFromPublic({ x: x.toString("hex"), y: y.toString("hex") }, "hex");
const okSig = key.verify(msgHash, { r: r.toString("hex"), s: s.toString("hex") });
if (!okSig) throw new Error("Firma inválida: (r,s) no verifica con la publicKey");

ok("Firma OK: (r,s) verifica con publicKey", "OK");
console.log("\n RESULTADO: hashToSign y firma verifican correctamente.\n");
