"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.didToBytes32 = didToBytes32;
const ethers_1 = require("ethers");
function didToBytes32(did) {
    if (!did || typeof did !== "string") {
        throw new Error("didToBytes32: DID inválido");
    }
    return ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(did));
}
