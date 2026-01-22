import fs from "node:fs";
import { ethers } from "ethers";
import { keccak_256 } from "@noble/hashes/sha3";
import { Buffer } from "node:buffer";
import elliptic from "elliptic";

const API_BASE = process.env.API_BASE || "http://localhost:3000/api/v1";

const ROOT_PATH = process.env.ROOT_PATH || "root.json";
const CHILD_PATH = process.env.CHILD_PATH || "child.json";

const ABI_PATH =
  process.env.ABI_PATH ||
  "node_modules/@red-isbe/did-isbe-registry/abis/IDidRegistry.json";

function section(title) {
  console.log(`\n══════════════════════════════════════`);
  console.log(`${title}`);
  console.log(`══════════════════════════════════════\n`);
}

function ok(label, value) {
  console.log(` ${label}${value !== undefined ? `: ${value}` : ""}`);
}

function warn(label, value) {
  console.warn(`  ${label}${value !== undefined ? `: ${value}` : ""}`);
}

function die(label, e) {
  console.error(` ${label}`);
  console.error(e?.message || e);
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function post(endpoint, body) {
  console.log(`\n POST ${endpoint}`);
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

async function get(endpoint, params) {
  const url = new URL(`${API_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, String(v));
  const res = await fetch(url);
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

function loadIface() {
  try {
    const raw = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
    const abi = raw.abi ?? raw;
    return new ethers.Interface(abi);
  } catch {
    warn("No pude leer ABI, no se decodifican custom errors", ABI_PATH);
    return null;
  }
}

function tryDecodeError(iface, data) {
  if (!iface || !data || typeof data !== "string" || !data.startsWith("0x")) return null;
  try {
    const parsed = iface.parseError(data);
    return {
      name: parsed?.name,
      args: parsed?.args ? Array.from(parsed.args) : [],
      signature: parsed?.signature,
    };
  } catch {
    return null;
  }
}

function getRevertData(e) {
  return e?.data || e?.info?.error?.data || e?.error?.data || e?.receipt?.revertReason || null;
}

async function simulateOrThrow(provider, from, txReq, iface, label) {
  try {
    const gas = await provider.estimateGas({ to: txReq.to, from, data: txReq.data });
    ok(`${label} estimateGas`, gas.toString());
  } catch (e) {
    const data = getRevertData(e);
    console.log("estimateGas REVERT:", { shortMessage: e?.shortMessage, code: e?.code, data, message: e?.message });
    const decoded = tryDecodeError(iface, data);
    if (decoded) console.log("Custom error:", decoded);
    const err = new Error(`${label} pre-simulación (estimateGas) falló`);
    err.decoded = decoded;
    err.data = data;
    throw err;
  }

  try {
    await provider.call({ to: txReq.to, from, data: txReq.data });
    ok(`${label} eth_call`, "OK (no revierte)");
  } catch (e) {
    const data = getRevertData(e);
    console.log("eth_call REVERT:", { shortMessage: e?.shortMessage, code: e?.code, data, message: e?.message });
    const decoded = tryDecodeError(iface, data);
    if (decoded) console.log("Custom error:", decoded);
    const err = new Error(`${label} pre-simulación (eth_call) falló`);
    err.decoded = decoded;
    err.data = data;
    throw err;
  }
}

async function signAndSend(provider, signer, txReq) {
  txReq.nonce = await provider.getTransactionCount(signer.address, "pending");

  if (!txReq.gasLimit) {
    const g = await provider.estimateGas({ to: txReq.to, from: signer.address, data: txReq.data });
    txReq.gasLimit = (g * 12n) / 10n;
  }

  const signed = await signer.signTransaction(txReq);
  ok("rawTx firmado", `${signed.slice(0, 12)}…`);
  await post("/sendSignedTransaction", { rawTx: signed });
  ok("Transacción enviada", "OK");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function verifyLocal(o, label) {
  section(`PRECHECK LOCAL — ${label}`);

  assert(/^did:isbe:[^:]+:[0-9a-f]{40}$/.test(o.did), "DID inválido");
  assert(/^[0-9a-f]{40}$/.test(o.methodSpecificId), "methodSpecificId inválido");
  assert(o.did.endsWith(":" + o.methodSpecificId), "DID no termina en methodSpecificId");

  assert(/^0x[0-9a-f]{128}$/.test(o.publicKeyHex), "publicKeyHex inválido (64 bytes XY)");
  const pubXY = Buffer.from(String(o.publicKeyHex).slice(2), "hex");
  assert(pubXY.length === 64, "publicKeyHex bytes != 64");

  assert(/^0x[0-9a-f]{130}$/.test(o.proofHex), "proofHex inválido (65 bytes r||s||v)");
  assert(/^0x[0-9a-f]{130}$/.test(o.proofRsv), "proofRsv inválido (65 bytes r||s||v)");
  assert(o.proofHex.toLowerCase() === o.proofRsv.toLowerCase(), "proofHex != proofRsv");

  const sigBytes = Buffer.from(String(o.proofRsv).slice(2), "hex");
  assert(sigBytes.length === 65, "proofRsv bytes != 65");
  const v = sigBytes[64];
  assert(v === 27 || v === 28, `v inválido: ${v}`);

  const x = pubXY.subarray(0, 32);
  const y = pubXY.subarray(32, 64);
  const msgHash = Buffer.from(keccak_256(Buffer.concat([x, y])));
  const msgHashHex = "0x" + msgHash.toString("hex");
  assert(msgHashHex.toLowerCase() === String(o.hashToSign).toLowerCase(), "hashToSign no coincide");

  const curveName = o.ellipticType === 2 ? "p256" : "secp256k1";
  const ec = new elliptic.ec(curveName);
  const r = sigBytes.subarray(0, 32).toString("hex");
  const s = sigBytes.subarray(32, 64).toString("hex");
  const key = ec.keyFromPublic({ x: x.toString("hex"), y: y.toString("hex") }, "hex");
  const okSig = key.verify(msgHash, { r, s });
  assert(okSig, "Firma inválida (r,s) no verifica");

  ok("Formato", "OK");
  ok("Crypto (hash + verify)", "OK");
  ok("curve", curveName);
  ok("DID", o.did);
}


async function didExists(did) {
  const candidates = [
    { path: "/getDidDocument", q: { did } },
    { path: "/getDidDocumentTimestamp", q: { did } },
    { path: "/didDocument", q: { did } },
    { path: "/DidDocument", q: { did } },
  ];

  for (const c of candidates) {
    try {
      const res = await get(c.path, c.q);
      if (res) return true;
    } catch (e) {

    }
  }

  return false;
}

function isFirstKeyMismatch(decoded) {
  return decoded?.name === "FirstPublicKeyMustBeTheSameThanTheNetwork";
}

async function ensureRoot({ provider, signer, iface, root }) {
  section("ENSURE ROOT (insertFirstDidDocument)");

  const exists = await didExists(root.did);
  if (exists) {
    ok("ROOT ya existe", `SKIP (${root.did})`);
    return { skipped: true };
  }

  ok("ROOT no existe", "Intentaré insertFirstDidDocument");

  const rootPayload = {
    did: root.did,
    vMethodId: root.vMethodId,
    publicKey: JSON.stringify(root.publicKeyJwk),
    proof: root.proofRsv,
    baseDocument: root.baseDocument ?? "{}",
    ellipticType: root.ellipticType,
    notBefore: root.notBefore,
    notAfter: root.notAfter,
    alsoKnownAs: root.alsoKnownAs ?? [],
  };

  const rawRoot = await post("/insertFirstDidDocument", rootPayload);
  const rootTxHex = rawRoot?.tx ?? rawRoot;
  if (typeof rootTxHex !== "string") throw new Error("Respuesta inválida insertFirstDidDocument");

  const rootTxReq = ethers.Transaction.from(rootTxHex);

  try {
    await simulateOrThrow(provider, signer.address, rootTxReq, iface, "ROOT");
  } catch (e) {
    const decoded = e?.decoded;
    if (isFirstKeyMismatch(decoded)) {
      warn(
        "ROOT rechazado por regla de red (FirstPublicKeyMustBeTheSameThanTheNetwork)",
        "Tu publicKey ROOT no coincide con la clave configurada para esta red."
      );
      warn("Qué hacer", "Usa la privKey ROOT esperada por la red o reinicia/configura tu contrato local para aceptar tu root.");
    }
    throw e;
  }

  await signAndSend(provider, signer, rootTxReq);
  ok("ROOT insertado", root.did);
  return { skipped: false };
}

async function insertChild({ provider, signer, iface, child }) {
  section("INSERT CHILD (insertDidDocument)");

  const childPayload = {
    did: child.did,
    vMethodId: child.vMethodId,
    publicKey: JSON.stringify(child.publicKeyJwk),
    proof: child.proofRsv,
    baseDocument: child.baseDocument ?? "{}",
    ellipticType: child.ellipticType,
    notBefore: child.notBefore,
    notAfter: child.notAfter,
    alsoKnownAs: child.alsoKnownAs ?? [],
  };

  const rawChild = await post("/insertDidDocument", childPayload);
  const childTxHex = rawChild?.tx ?? rawChild;
  if (typeof childTxHex !== "string") throw new Error("Respuesta inválida insertDidDocument");

  const childTxReq = ethers.Transaction.from(childTxHex);
  await simulateOrThrow(provider, signer.address, childTxReq, iface, "CHILD");
  await signAndSend(provider, signer, childTxReq);

  ok("CHILD insertado", child.did);
}

async function main() {
  const rpc = process.env.RPC_NODO_CLIENTE || "http://localhost:8545";
  const priv = process.env.DEPLOYER_PRIV_KEY;
  if (!priv) throw new Error("Falta DEPLOYER_PRIV_KEY en env");

  const provider = new ethers.JsonRpcProvider(rpc);
  const signer = new ethers.Wallet(priv, provider);
  const iface = loadIface();

  const root = readJson(ROOT_PATH);
  const child = readJson(CHILD_PATH);

  section("SETUP");
  ok("API_BASE", API_BASE);
  ok("RPC", rpc);
  ok("Signer", signer.address);
  ok("ROOT_PATH", ROOT_PATH);
  ok("CHILD_PATH", CHILD_PATH);

  verifyLocal(root, "ROOT");
  verifyLocal(child, "CHILD");

  try {
    const conf = await get("/CurrentConfig");
    ok("CurrentConfig", typeof conf === "string" ? conf : JSON.stringify(conf));
  } catch {
    warn("No pude leer CurrentConfig", "OK (no es bloqueante)");
  }

  try {
    await post("/initializeDiDRegistry", { ellipticType: root.ellipticType ?? 1 });
    ok("initializeDiDRegistry", "OK");
  } catch {
    warn("initializeDiDRegistry", "falló (probablemente ya inicializado). Continúo.");
  }

  await ensureRoot({ provider, signer, iface, root });

  await insertChild({ provider, signer, iface, child });

  section("DONE");
  console.log(" E2E OK: prechecks locales + build tx + simulate + sendSignedTransaction.\n");
}

main().catch((e) => die("E2E falló", e));
