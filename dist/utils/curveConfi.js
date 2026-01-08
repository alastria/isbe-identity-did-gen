"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEllipticType = loadEllipticType;
exports.saveEllipticType = saveEllipticType;
exports.ellipticTypeToCurveName = ellipticTypeToCurveName;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const CONFIG_FILE = path_1.default.join(process.cwd(), ".curve_config");
function loadEllipticType() {
    try {
        if (!fs_1.default.existsSync(CONFIG_FILE))
            return 1;
        const raw = fs_1.default.readFileSync(CONFIG_FILE, "utf8");
        const json = JSON.parse(raw);
        if (json && (json.ellipticType === 1 || json.ellipticType === 2)) {
            return json.ellipticType;
        }
    }
    catch (e) {
        console.error("Error leyendo .curve_config:", e);
    }
    return 1;
}
function saveEllipticType(ellipticType) {
    try {
        const cfg = { ellipticType };
        fs_1.default.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
        console.log(`\nCurva guardada en .curve_config (ellipticType=${ellipticType})`);
    }
    catch (e) {
        console.error("Error guardando .curve_config:", e);
    }
}
function ellipticTypeToCurveName(ellipticType) {
    return ellipticType === 2 ? "p256" : "secp256k1";
}
