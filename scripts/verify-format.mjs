import fs from "node:fs";
import path from "node:path";


const args = process.argv.slice(2);
const fileFlagIndex = args.indexOf("--file");

if (fileFlagIndex === -1 || !args[fileFlagIndex + 1]) {
  console.error("Debes indicar el archivo con --file <ruta>");
  console.error("Ejemplo: node scripts/verify-format.mjs --file child.json");
  process.exit(1);
}

const filePath = args[fileFlagIndex + 1];

const resolvedPath = path.resolve(process.cwd(), filePath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`El archivo no existe: ${resolvedPath}`);
  process.exit(1);
}

const o = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));

function assert(cond, msg) {
  if (!cond) throw new Error("NO " + msg);
}

function hexBytes(hex) {
  if (typeof hex !== "string" || !hex.startsWith("0x")) return null;
  return (hex.length - 2) / 2;
}

console.log(`\nVERIFY FORMAT — ${filePath}\n`);

function ok(label, value) {
  console.log(` ${label}${value !== undefined ? `: ${value}` : ""}`);
}

function fail(label, err) {
  console.error(` ${label}`);
  if (err?.message) console.error(`   ↳ ${err.message}`);
  else console.error(`   ↳ ${String(err)}`);
}

function section(title) {
  console.log(`\n══════════════════════════════════════`);
  console.log(` ${title}`);
  console.log(`══════════════════════════════════════\n`);
}

function check(label, fn) {
  try {
    fn();
    ok(label);
  } catch (e) {
    fail(label, e);
    throw e;
  }
}

section(`VERIFY FORMAT — ${filePath}`);

check("DID cumple formato did:isbe:<ns>:<40hex>", () => {
  assert(/^did:isbe:[^:]+:[0-9a-f]{40}$/.test(o.did), "DID formato");
});
ok("DID", o.did);

check("methodSpecificId es 40 hex (20 bytes)", () => {
  assert(/^[0-9a-f]{40}$/.test(o.methodSpecificId), "methodSpecificId 40 hex");
});
ok("methodSpecificId", o.methodSpecificId);

check("DID termina en methodSpecificId", () => {
  assert(o.did.endsWith(":" + o.methodSpecificId), "DID endswith methodSpecificId");
});

check("publicKeyHex es 64 bytes (X||Y)", () => {
  assert(/^0x[0-9a-f]{128}$/.test(o.publicKeyHex), "publicKeyHex 64 bytes XY");
  assert(hexBytes(o.publicKeyHex) === 64, "publicKeyHex bytes=64");
});
ok("publicKeyHex", `${o.publicKeyHex.slice(0, 12)}…${o.publicKeyHex.slice(-10)} (${hexBytes(o.publicKeyHex)} bytes)`);

check("proofHex es 65 bytes (r||s||v)", () => {
  assert(/^0x[0-9a-f]{130}$/.test(o.proofHex), "proofHex 65 bytes r||s||v");
  assert(hexBytes(o.proofHex) === 65, "proofHex bytes=65");
});
ok("proofHex", `${o.proofHex.slice(0, 12)}…${o.proofHex.slice(-10)} (${hexBytes(o.proofHex)} bytes)`);

check("proofRsv es 65 bytes (r||s||v)", () => {
  assert(/^0x[0-9a-f]{130}$/.test(o.proofRsv), "proofRsv 65 bytes r||s||v");
  assert(hexBytes(o.proofRsv) === 65, "proofRsv bytes=65");
});
ok("proofRsv", `${o.proofRsv.slice(0, 12)}…${o.proofRsv.slice(-10)} (${hexBytes(o.proofRsv)} bytes)`);

check("proofHex == proofRsv (misma proof)", () => {
  assert(o.proofHex.toLowerCase() === o.proofRsv.toLowerCase(), "proofHex debe ser igual a proofRsv");
});

console.log("\n RESULTADO: Formato consistente y longitudes correctas.\n");


