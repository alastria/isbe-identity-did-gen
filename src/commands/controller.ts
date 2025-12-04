
/**
* Copyright (c) 2025 Comunidad de Madrid & Alastria 
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License. 
*
* You may obtain a copy of the License at
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
 
import chalk from "chalk"; 
import { JsonRpcProvider, Wallet, ethers } from "ethers";
import fs from "fs";
import { api } from "../api/client";
import { findDID } from "../utils/localStorage";
 
 
function isAddress(x: string): boolean { 
  return /^0x[a-fA-F0-9]{40}$/.test(x);
}
 
function isDid(x: string): boolean {
  return x.startsWith("did:isbe:");
}
 
function normalizePrivKey(pk: string): string {
  const trimmed = pk.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`; 
}
  
function resolveDidToAddress(did: string): string | null {
  if (!isDid(did)) return null; 
  try {
    const found = findDID(did);
    if (found) {
      const anyFound = found as any;
      if (anyFound.owner && isAddress(anyFound.owner)) {
        return anyFound.owner; 
      }
    }
  } catch { 
  }
  
  try {
    const rootFile = fs.readFileSync(".did_root", "utf8");
    const lines = rootFile.split("\n");
    const pkLine = lines.find((l) => l.startsWith("PRIVATE_KEY="));
    const didLine = lines.find((l) => l.startsWith("DID="));
    if (pkLine && didLine) {
      const rootDid = didLine.replace("DID=", "").trim(); 
      if (rootDid === did) {
        const privKeyRaw = pkLine.replace("PRIVATE_KEY=", "").trim();
        const wallet = new Wallet(normalizePrivKey(privKeyRaw));
        return wallet.address;
      } 
    }
  } catch { 
  }
  return null;
}
 
 
export class ControllerCommands { 
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private rpcUrl: string;

  constructor(provider: JsonRpcProvider, wallet: Wallet, rpcUrl: string) {
    this.provider = provider;
    this.wallet = wallet;
    this.rpcUrl = rpcUrl; 
  }
 
   normalizeControllerInput(input: string): { did?: string; address: string } {
    if (isAddress(input)) {
      return { address: input }; 
    }
  
    if (isDid(input)) {
      const addr = resolveDidToAddress(input);
      if (!addr) {
         throw new Error(
          "No pude resolver la address del DID " +
            input + 
            ". ¿Existe en .dids.json o es el DID definido en .did_root?"
        );
      }
      return { did: input, address: addr };
    } 
    throw new Error("Formato inválido de controller: " + input);
  }
    async addController(did: string, controllerDid: string): Promise<void> {
     console.log( 
      chalk.cyan("Añadiendo controller: "), 
      "\n   Controller (DID):", controllerDid, 
      "\n   Target DID:", did, 
      "\n" 
    ); 
    try { 
      const { data } = await api.post("/addController", {
        did, 
        controller: controllerDid, 
      });
      console.log(chalk.green("Controller añadido.")); 
      console.log(JSON.stringify(data, null, 2));
      let rawTx: string | undefined; 
      if (typeof data === "string") { 
        rawTx = data; 
      } else if (data?.tx && typeof data.tx === "string") {
        rawTx = data.tx;
      } else if (data?.rawTx && typeof data.rawTx === "string") {
        rawTx = data.rawTx;
      }
      if (!rawTx || !rawTx.startsWith("0x")) {
        console.error("Respuesta inesperada de /addController:", data);
        throw new Error(
          "La API /addController no devolvió una rawTx válida (string 0x...)"
        );
      }
      const receipt = await this.buildSignSend(rawTx);
      console.log(
        chalk.green(
          `add-controller ON-CHAIN completado. Tx: ${
            (receipt as any)?.hash ||
            (receipt as any)?.transactionHash ||
            "(hash no disponible)"
          }`
        )
      );
    } catch (err: any) {
      console.error(chalk.red("Error en addController:"));
      console.error(err?.response?.data || err?.message || err);
      throw err;
    }
  }

    async revokeController(did: string, controllerDid: string): Promise<void> { 
    console.log(
      chalk.cyan("Revocando controller: "),
      "\n   Controller (DID):", controllerDid,
      "\n   Target DID:", did, 
      "\n"
    );
    try { 
      const { data } = await api.post("/revokeController", {
        did,
        controller: controllerDid,
      });
      console.log(chalk.green("Controller revocado."));
      console.log(JSON.stringify(data, null, 2));
      let rawTx: string | undefined;
      if (typeof data === "string") {
        rawTx = data;
      } else if (data?.tx && typeof data.tx === "string") {
        rawTx = data.tx;
      } else if (data?.rawTx && typeof data.rawTx === "string") {
        rawTx = data.rawTx;
      }
      if (!rawTx || !rawTx.startsWith("0x")) {
        console.error("Respuesta inesperada de /revokeController:", data);
        throw new Error(
          "La API /revokeController no devolvió una rawTx válida (string 0x...)"
        );
      }
      const receipt = await this.buildSignSend(rawTx);
      console.log(
        chalk.green(
          `revoke-controller ON-CHAIN completado. Tx: ${
            (receipt as any)?.hash ||
            (receipt as any)?.transactionHash ||
            "(hash no disponible)"
          }`
        )
      );
    } catch (err: any) {
      console.error(chalk.red("Error en revokeController:"));
      console.error(err?.response?.data || err?.message || err);
      throw err;
    }
  }
  async checkController( 
    targetDid: string,
    controllerInput: string
  ): Promise<any> { 
    console.log( 
      chalk.blue("Verificando controller:"), 
      "\n   Controller input:", 
      controllerInput,
      "\n   Target DID:",
      targetDid,
      "\n"
    );
    const { address } = this.normalizeControllerInput(controllerInput);
    try {
      const res = await api.get("/checkController", {
        params: {
          did: targetDid,
          controllerId: address, 
        },
      });
      console.log(chalk.green("Resultado checkController:"));
      console.log(JSON.stringify(res.data, null, 2));
      return res.data;
    } catch (err: any) {
      console.error("Error verificando controller");
      console.error(err?.response?.data || err?.message || err);
    } 
  }
 
  async listDidsByController(
    controllerDid: string,
    page: number,
    pageSize: number
  ): Promise<any> {
    console.log(
      chalk.blue(
        `Listando DIDs controlados por ${controllerDid} (page=${page}, size=${pageSize})…`
      )
    );
    if (!isDid(controllerDid)) {
      throw new Error(
        "list-dids-by-controller SOLO acepta DID como controller (no address)."
      );
    }
    try {
      const res = await api.get("/getDidsByController", {
        params: {
          controllerId: controllerDid,
          page,
          pageSize, 
        },
      });
      console.log(chalk.green("Consulta completada:"));
      console.log(JSON.stringify(res.data, null, 2));
      return res.data;
    } catch (err: any) {
      console.error("Error listando DIDs por controller");
      console.error(err?.response?.data || err?.message || err);
    }
  }
}
 
 