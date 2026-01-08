"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRootWallet = loadRootWallet;
const fs_1 = __importDefault(require("fs"));
const ethers_1 = require("ethers");
function loadRootWallet(provider) {
    if (!fs_1.default.existsSync(".did_root")) {
        throw new Error(" No existe archivo .did_root. Debes crear un root DID primero.");
    }
    const env = fs_1.default.readFileSync(".did_root", "utf8");
    const lines = env.split("\n");
    const privLine = lines.find(l => l.startsWith("PRIVATE_KEY="));
    if (!privLine) {
        throw new Error(" .did_root no contiene PRIVATE_KEY");
    }
    const privateKey = privLine.replace("PRIVATE_KEY=", "").trim();
    return new ethers_1.Wallet(privateKey, provider);
}
