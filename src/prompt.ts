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
 * Secret input that never reaches argv, the shell history or the terminal
 * scrollback.
 */

import { createInterface } from "node:readline";
import { Writable } from "node:stream";

const MIN_PASSPHRASE_LENGTH = 8;

/** Env var for unattended runs. See the warning in the README before using it. */
export const PASSPHRASE_ENV = "ISBE_KEYSTORE_PASSPHRASE";

class MutableOutput extends Writable {
  muted = false;
  constructor(private readonly target: NodeJS.WriteStream) {
    super();
  }
  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!this.muted) this.target.write(chunk, encoding);
    callback();
  }
}

/**
 * Reads a line from the TTY without echoing it.
 *
 * The prompt goes to stderr so that stdout stays a clean data channel and the
 * command can be piped.
 */
export function promptSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return Promise.reject(
      new Error(
        `No interactive terminal available to read "${prompt.trim()}". ` +
          `Pipe the passphrase on stdin with --passphrase-stdin, or set ${PASSPHRASE_ENV}.`,
      ),
    );
  }

  const output = new MutableOutput(process.stderr);
  const rl = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });

  return new Promise<string>((resolve, reject) => {
    rl.on("error", reject);
    // Written before muting so the label itself is visible.
    process.stderr.write(prompt);
    output.muted = true;
    rl.question("", (answer) => {
      output.muted = false;
      process.stderr.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

/** Reads the whole of stdin, trimming a single trailing newline. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

/**
 * Reads a private key from the terminal without echoing it.
 *
 * Used by `import-key`, so migrating an existing key never requires putting
 * it on a command line.
 */
export async function promptPrivateKey(): Promise<string> {
  return await promptSecret("Private key (64 hex chars, 0x optional): ");
}

/**
 * Asks a yes/no question on the terminal (with echo - nothing secret here).
 * Only an explicit "yes" counts; anything else, including Enter, is a no.
 */
export function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return Promise.reject(
      new Error(
        `No interactive terminal available to confirm "${question.trim()}". Pass --yes to skip the confirmation.`,
      ),
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise<boolean>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

export type PassphraseOptions = {
  /** Read the passphrase from stdin instead of prompting. */
  passphraseStdin?: boolean;
};

/**
 * Resolves a passphrase for an existing keystore.
 *
 * Precedence: --passphrase-stdin, then the env var, then an interactive
 * prompt. argv is deliberately not an option.
 */
export async function resolvePassphrase(
  opts: PassphraseOptions,
  prompt = "Keystore passphrase: ",
): Promise<string> {
  if (opts.passphraseStdin) return await readStdin();
  const fromEnv = process.env[PASSPHRASE_ENV];
  if (fromEnv) return fromEnv;
  return await promptSecret(prompt);
}

/**
 * Resolves a passphrase for a keystore being created, asking twice so a typo
 * cannot silently lock the key away.
 */
export async function resolveNewPassphrase(
  opts: PassphraseOptions,
): Promise<string> {
  if (opts.passphraseStdin) return await readStdin();
  const fromEnv = process.env[PASSPHRASE_ENV];
  if (fromEnv) return fromEnv;

  const passphrase = await promptSecret("Choose a keystore passphrase: ");
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `Passphrase too short: use at least ${MIN_PASSPHRASE_LENGTH} characters. ` +
        `It is the only thing protecting the key if the file is copied.`,
    );
  }
  const confirmation = await promptSecret("Repeat the passphrase: ");
  if (passphrase !== confirmation) {
    throw new Error("The two passphrases do not match.");
  }
  return passphrase;
}
