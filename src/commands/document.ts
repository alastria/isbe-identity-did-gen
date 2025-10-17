/**  
* Copyright (c) 2025 Comunidad de Madrid & Alastria  
*  
* Licensed under the Apache License, Version 2.0 (the "License");  
* you may not use this file except in compliance with the License.  
*  
* You may obtain a copy of the License at  
* [http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0 "http://www.apache.org/licenses/license-2.0")  
*  
* Unless required by applicable law or agreed to in writing, software  
* distributed under the License is distributed on an "AS IS" BASIS,  
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  
* See the License for the specific language governing permissions and  
* limitations under the License.  
*/

import { JsonRpcProvider, Wallet } from "ethers";
import chalk from "chalk";
import { randomBytes } from "crypto";
import elliptic from "elliptic";
import { keccak_256 } from "@noble/hashes/sha3";
import IDidDocumentDetailed from "../../../../libs/did-isbe-lib/identity/didregistry/IDidDocumentDetailed";
 
const ec = new elliptic.ec("secp256k1");
 
function hexToJwk(hexKey: string) {
  if (hexKey.startsWith("0x")) hexKey = hexKey.slice(2);
  const buf = Buffer.from(hexKey, "hex");
  if (buf[0] !== 0x04) throw new Error("Public key no está en formato uncompressed (0x04...)");

  const x = buf.slice(1, 33);
  const y = buf.slice(33, 65);

  const toBase64Url = (b: Buffer) =>
    b
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  return {
    kty: "EC",
    crv: "secp256k1",
    x: toBase64Url(x),
    y: toBase64Url(y),
  };
}

export default class DidDocument {
  private provider: JsonRpcProvider;
  private wallet: Wallet;
  private didDoc: IDidDocumentDetailed;
  
  constructor(provider: JsonRpcProvider, wallet: Wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.didDoc = new IDidDocumentDetailed(provider, wallet);
  }
 
  async init() {
    try {
      const receipt = await this.didDoc.initializeDiDRegistry(1);
      console.log(chalk.green("initializeDiDRegistry tx:"), receipt.hash);
    } catch {
      console.log(chalk.yellow("initializeDiDRegistry ya fue llamado anteriormente"));
    }
  }
  private selfSign(privHex: string) {
    const key = ec.keyFromPrivate(privHex);
    const pubPoint = key.getPublic();
    const pubUncompressed = Buffer.from(pubPoint.encode("hex", false), "hex");
    const msg = keccak_256(pubUncompressed);
    const sig = key.sign(msg, { canonical: true });
    const signatureDER = Buffer.from(sig.toDER());
 
    return {
      signatureDER,
      pubUncompressedHex: pubPoint.encode("hex", false),
    };
  }
 
  private buildDID(signatureDER: Buffer, modelDeployId: string) {
    const last32 = signatureDER.subarray(signatureDER.length - 32);
    const methodSpecificId = last32.toString("hex");
    return `did:isbe:${modelDeployId}:${methodSpecificId}`;
  }
 
  async createFromWallet(
    modelDeployId: string,
    vMethodId: string,
    ellipticType: number,
    validityDays: number
  ) {
    const priv = randomBytes(32).toString("hex");
    console.log(chalk.yellow(" Private key generada (hex):"), priv);
    const walletFromPriv = new Wallet("0x" + priv);
    const address = walletFromPriv.address.toLowerCase(); 
    console.log(chalk.magenta("Address derivada:"), address);
    
    const pubKeySignature = this.selfSign(priv);
    const did = this.buildDID(pubKeySignature.signatureDER, modelDeployId);
    const publicKeyHex = "0x" + pubKeySignature.pubUncompressedHex;
 
    const now = Math.floor(Date.now() / 1000);
    const notBefore = now;
    const notAfter = now + validityDays * 24 * 60 * 60;
    const baseDocument = JSON.stringify({ "@context": "https://www.w3.org/ns/did/v1" });
 
    console.log(chalk.blue("DID generado:"), did);
    console.log(chalk.cyan("PublicKeyHex (uncompressed):"), publicKeyHex);

    try {
      const receipt = await this.didDoc.insertDidDocument(
        did,
        baseDocument,
        vMethodId,
        publicKeyHex,
        ellipticType,
        notBefore,
        notAfter
      );
 
      console.log(chalk.green("insertDidDocument tx:"), receipt.hash);
      return { did, publicKeyHex };
    } catch (err) {
      console.error(chalk.red("Error en insertDidDocument:"), err);
    }
  }
 
  async get(
    did: string,
    format: "hex" | "jwk" = "hex",
    includeContext = true
  ) {
    const doc = await this.didDoc.getDidDocument(did);

    if (!includeContext && doc?.baseDocument) {
      try {
        const parsed = JSON.parse(doc.baseDocument);
        delete parsed["@context"];
        doc.baseDocument = JSON.stringify(parsed);
      } catch {
        console.warn("No se pudo procesar baseDocument para eliminar @context");
      }
    }

    if (format === "jwk" && doc?.publicKeyHex) {
      try {
        const jwk = hexToJwk(doc.publicKeyHex);
        doc.publicKeyJwk = jwk;
      } catch (err) {
        console.error(chalk.red("Error convirtiendo hex → JWK:"), err);
      }
    }

    console.log(chalk.cyan("\ngetDidDocument →"));
    console.dir(doc, { depth: null, colors: true });
    return doc;
  }
 
  async getByTimestamp(did: string, timestamp: number, format: "hex" | "jwk" = "hex") {
    const docTs = await this.didDoc.getDidDocumentByTimestamp(did, timestamp);

    if (format === "jwk" && Array.isArray(docTs?.vMethods)) {
      for (const v of docTs.vMethods) {
        if (v.publicKey) {
          try {
            const jwk = hexToJwk(v.publicKey);
            v.publicKeyJwk = jwk;
          } catch (err) {
            console.error(chalk.red("Error convirtiendo hex → JWK:"), err);
          }
        }
      }
    }

    console.log(chalk.cyan("\ngetDidDocumentByTimestamp →"));
    console.dir(docTs, { depth: null, colors: true });
    return docTs;
  }
 
  async list(page: number, pageSize: number) {
    const res = await this.didDoc.getDids(page,pageSize);
    const allDids = await this.didDoc.getDids(page, pageSize);
    console.log(chalk.cyan("\ngetDids →"));
    for (const [i, d] of allDids.items.entries()) {
      console.log(`  ${i + 1}. ${d}`);
    }
    console.log(`  total: ${allDids.total}`);
    console.log(`  howMany: ${allDids.howMany}`);
    console.log(`  prev: ${allDids.prev}`);
    console.log(`  next: ${allDids.next}`);
    return res;
  }
 
  async update(did: string, newDoc: string) {

    try {
      const receipt = await this.didDoc.updateBaseDocument(did, newDoc);
      console.log(chalk.green("updateBaseDocument tx:"), receipt.hash);
    } catch (err) {
      console.error(chalk.red("Error en updateBaseDocument:"), err);
    }
  }
}
 