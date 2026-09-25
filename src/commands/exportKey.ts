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

/**
 * Decrypts a keystore back to the raw private key.
 *
 * The inverse of `import-key`, for moving a key into a tool that cannot read
 * keystores. This is the one place where the key deliberately leaves the
 * process in the clear, so the command around it asks for confirmation before
 * printing to a terminal - see `export-key` in index.ts.
 */

import { decryptKeystore } from "../keystore";
import { getEc, publicKeyToEOA, wipe } from "../utils";

export type ExportedKey = {
  /** 0x-prefixed, 64 hex chars: the format `import-key` and `-p` accept. */
  privateKeyHex: string;
  address: string;
};

export async function exportPrivateKey(
  keystoreJson: string,
  passphrase: string,
): Promise<ExportedKey> {
  const { privateKey, curve } = await decryptKeystore(keystoreJson, passphrase);
  try {
    const key = getEc(curve).keyFromPrivate(privateKey);
    const address = await publicKeyToEOA(
      "0x" + key.getPublic().encode("hex", false),
    );
    return { privateKeyHex: "0x" + privateKey.toString("hex"), address };
  } finally {
    wipe(privateKey);
  }
}
