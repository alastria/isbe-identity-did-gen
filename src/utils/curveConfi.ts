import fs from "fs";
import path from "path";
const CONFIG_FILE = path.join(process.cwd(), ".curve_config");
export type CurveName = "secp256k1" | "p256";
export interface CurveConfig {
  ellipticType: number; 
}
 
export function loadEllipticType(): number {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return 1;
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const json = JSON.parse(raw) as CurveConfig;
    if (json && (json.ellipticType === 1 || json.ellipticType === 2)) {
      return json.ellipticType;
    }
  } catch (e) {
    console.error("Error leyendo .curve_config:", e);
  }
  return 1;
}

export function saveEllipticType(ellipticType: number): void {
  try {
    const cfg: CurveConfig = { ellipticType };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
    console.log(`\nCurva guardada en .curve_config (ellipticType=${ellipticType})`);
  } catch (e) {
    console.error("Error guardando .curve_config:", e);
  }
}

export function ellipticTypeToCurveName(ellipticType: number): CurveName {
  return ellipticType === 2 ? "p256" : "secp256k1";
}

 