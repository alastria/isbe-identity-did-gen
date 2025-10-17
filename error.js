const { keccak256, toUtf8Bytes } = require("ethers");
const fs = require("fs");
 
const abiJson = JSON.parse(fs.readFileSync("../../../contracts/did-isbe-registry/artifacts/contracts/identity/didregistry/IDidRegistry.sol/IDidRegistry.json", "utf8"));
const abi = abiJson.abi || abiJson;
 
const errors = abi.filter((x) => x.type === "error");
 
for (const e of errors) {
  const sig = `${e.name}(${(e.inputs || []).map((i) => i.type).join(",")})`;
  const selector = keccak256(toUtf8Bytes(sig)).slice(0, 10);
  console.log(selector, sig);
}