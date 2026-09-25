#!/usr/bin/env node
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

import { Command, Option } from "commander";
import { AcceptedCurves } from "./types";
import { buildDID, proofFromSigner } from "./commands/did";
import {
  derivePublicArtifacts,
  generateKeys,
  generatePrivateKey,
} from "./commands/keys";
import { readUnsignedTx, signTransaction } from "./commands/signTx";
import { exportPrivateKey } from "./commands/exportKey";
import {
  createAndVerifyKeystoreFile,
  createKeystore,
  LocalKeySigner,
  readKeystoreFile,
  resolveRawPrivateKey,
  resolveSigner,
  Signer,
  SignerOptions,
  writeKeystoreFile,
} from "./signer";
import { stringToHex, wipe } from "./utils";
import { confirm, PASSPHRASE_ENV, resolvePassphrase } from "./prompt";
import { CLI_VERSION } from "./constants";
import { assertKeystoreSupportsCurve } from "./keystore";

const program = new Command();

/* --------------------------------- output --------------------------------- */

/**
 * Human-readable output goes to stderr; machine-readable output to stdout.
 * That way `did-gen sign-tx ... | curl -d @-` works, and a redirect of stdout
 * never silently captures a label or a warning.
 */
const out = (line = "") => process.stdout.write(line + "\n");
const note = (line = "") => process.stderr.write(line + "\n");
const warn = (line: string) => process.stderr.write(`Warning: ${line}\n`);
const fail = (line: string) => process.stderr.write(`Error: ${line}\n`);

function field(label: string, value: string) {
  note(label + ":");
  out(value);
  note();
}

function parseCurve(curveInput: unknown): AcceptedCurves {
  const curve = String(curveInput ?? "").trim() || "secp256k1";
  if (curve !== "secp256k1" && curve !== "P-256") {
    throw new Error('Invalid curve. Use --curve "secp256k1" or --curve "P-256".');
  }
  return curve;
}

/** Runs an action, reporting failures without leaking key material. */
async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (err: any) {
    fail(err?.message || String(err));
    process.exitCode = 1;
  }
}

/** Guarantees the key is wiped even when the command throws. */
async function withSigner(
  opts: SignerOptions,
  action: (signer: Signer) => Promise<void>,
): Promise<void> {
  const signer = await resolveSigner(opts, warn);
  try {
    await action(signer);
  } finally {
    signer.destroy();
  }
}

/* --------------------------------- options --------------------------------- */

const curveOption = new Option(
  "-c, --curve <string>",
  "Elliptic curve: secp256k1 (Case Network) or P-256 (Bare Network)",
).default("secp256k1");

function addKeySourceOptions(command: Command): Command {
  return command
    .option("-k, --keystore <file>", "Encrypted keystore file (recommended)")
    .option("--priv-key-stdin", "Read the private key hex from stdin")
    .addOption(
      new Option(
        "-p, --privKey <hex>",
        "DEPRECATED - private key hex; recorded in shell history and visible via ps",
      ).hideHelp(false),
    )
    .option(
      "--passphrase-stdin",
      "Read the keystore passphrase from stdin instead of prompting",
    );
}

program
  .name("did-gen")
  .description("DID ISBE Generator - CLI tool to generate DIDs for ISBE")
  .version(CLI_VERSION);

/* ----------------------------------- did ----------------------------------- */

program
  .command("did")
  .description("Generate DID + PublicKey + Proof from a keystore")
  .addOption(curveOption)
  .option("-m, --modelDeploy <string>", "Environment: uc (PRO) or uc-pre (PRE)", "uc")
  .option("--json", "Emit a single JSON object on stdout")
  .action(async (opts) =>
    run(async () => {
      const curve = parseCurve(opts.curve);
      const modelDeploy = String(opts.modelDeploy ?? "").trim() || "uc";

      await withSigner({ ...opts, curve }, async (signer) => {
        const proof = proofFromSigner(signer);
        const publicKey = signer.getPublicKey();
        const did = buildDID(proof, modelDeploy);
        const eoa = await signer.getAddress();

        if (opts.json) {
          out(JSON.stringify({ did, publicKey, proof, eoa, curve: signer.curve }, null, 2));
          return;
        }

        note();
        field("DID", did);
        field("Public Key", publicKey);
        field("Proof", proof);
        note(`EOA: ${eoa}`);
        note();
        note("Register these three values with the ISBE platform: DID, Public Key, Proof.");
      });
    }),
  );
addKeySourceOptions(program.commands[program.commands.length - 1]);

/* ---------------------------------- keys ----------------------------------- */

program
  .command("keys")
  .description("Generate a new key pair into an encrypted keystore")
  .addOption(curveOption)
  .option("-o, --out <file>", "Write the encrypted keystore to this file")
  .option(
    "--print-private",
    "Print the private key in the clear instead of writing a keystore (unsafe)",
  )
  .option(
    "--passphrase-stdin",
    "Read the keystore passphrase from stdin instead of prompting",
  )
  .action(async (opts) =>
    run(async () => {
      const curve = parseCurve(opts.curve);

      if (opts.printPrivate) {
        if (opts.out) {
          throw new Error("Use either --out or --print-private, not both.");
        }
        warn(
          "--print-private writes the private key to your terminal, where it stays " +
            "in the scrollback. Prefer --out to write an encrypted keystore.",
        );
        const keys = await generateKeys(curve);
        note();
        field("Private Key (hex)", keys.privateKeyHex);
        field("Private Key (JWK)", JSON.stringify(keys.privateJwk, null, 2));
        field("Public Key (hex)", keys.publicKeyHex);
        field("Public Key (JWK)", JSON.stringify(keys.publicJwk, null, 2));
        field("Public Key (JWK) Thumbprint", keys.thumbprint);
        field("Public Key (hex of JWK)", stringToHex(JSON.stringify(keys.publicJwk)));
        field(
          curve === "secp256k1" ? "EOA (Ethereum Address)" : "EOA (Bare Network Address)",
          keys.eoa,
        );
        return;
      }

      if (!opts.out) {
        throw new Error(
          "Where should the keystore go? Pass --out <file>. " +
            "To print the key in the clear instead, pass --print-private.",
        );
      }

      // Fail before generating a key we could not store.
      assertKeystoreSupportsCurve(curve);

      const privateKey = generatePrivateKey(curve);
      try {
        const keystore = await createKeystore(privateKey, curve, opts);
        writeKeystoreFile(opts.out, keystore);

        const artifacts = await derivePublicArtifacts(privateKey, curve);
        note();
        note(`Encrypted keystore written to ${opts.out} (mode 0600).`);
        note("Back it up: without the file and its passphrase the DID cannot be used again.");
        note();
        field("Public Key (hex)", artifacts.publicKeyHex);
        field("Public Key (JWK)", JSON.stringify(artifacts.publicJwk, null, 2));
        field("Public Key (JWK) Thumbprint - use as vMethodId", artifacts.thumbprint);
        field("Public Key (hex of JWK)", stringToHex(JSON.stringify(artifacts.publicJwk)));
        field(
          curve === "secp256k1" ? "EOA (Ethereum Address)" : "EOA (Bare Network Address)",
          artifacts.eoa,
        );
      } finally {
        wipe(privateKey);
      }
    }),
  );

/* -------------------------------- import-key -------------------------------- */

program
  .command("import-key")
  .description(
    "Move an existing private key into an encrypted keystore (migration from --privKey)",
  )
  .requiredOption("-o, --out <file>", "Write the encrypted keystore here")
  .addOption(curveOption)
  .option("--priv-key-stdin", "Read the private key hex from stdin")
  .addOption(
    new Option(
      "-p, --privKey <hex>",
      "DEPRECATED - private key hex; recorded in shell history and visible via ps",
    ),
  )
  .option(
    "--passphrase-stdin",
    "Read the keystore passphrase from stdin instead of prompting",
  )
  .option(
    "-m, --modelDeploy <string>",
    "Environment for the DID shown back to you: uc (PRO) or uc-pre (PRE)",
    "uc",
  )
  .action(async (opts) =>
    run(async () => {
      const curve = parseCurve(opts.curve);
      const modelDeploy = String(opts.modelDeploy ?? "").trim() || "uc";

      // Prompted without echo when no source flag is given, so migrating a
      // key never requires putting it on a command line.
      const privateKey = await resolveRawPrivateKey(opts, warn);

      try {
        await createAndVerifyKeystoreFile(privateKey, curve, opts, opts.out);

        // Show the DID this key produces so the operator can confirm the
        // imported key is the one behind an already-registered identity.
        const signer = new LocalKeySigner(privateKey, curve);
        try {
          const proof = proofFromSigner(signer);
          note();
          note(`Encrypted keystore written to ${opts.out} (mode 0600), and verified readable.`);
          note();
          field("DID", buildDID(proof, modelDeploy));
          note(`EOA: ${await signer.getAddress()}`);
          note();
          note("Check that DID against the identity you are migrating before deleting the old key.");
        } finally {
          signer.destroy();
        }
      } finally {
        wipe(privateKey);
      }
    }),
  );

/* -------------------------------- export-key -------------------------------- */

program
  .command("export-key")
  .description(
    "Decrypt a keystore and print the raw private key (for tools that cannot read keystores)",
  )
  .requiredOption("-k, --keystore <file>", "Encrypted keystore file")
  .option(
    "--passphrase-stdin",
    "Read the keystore passphrase from stdin instead of prompting",
  )
  .option("-y, --yes", "Skip the confirmation before printing to a terminal")
  .action(async (opts) =>
    run(async () => {
      const keystore = readKeystoreFile(opts.keystore);

      warn(
        "export-key prints the private key in the clear. Anyone who sees it " +
          "controls this identity. Prefer piping it (e.g. | pbcopy) over " +
          "letting it land in the terminal scrollback.",
      );

      // Printing to a screen is the exposure this whole CLI exists to avoid,
      // so it takes an explicit "yes". When stdout is piped the key never
      // reaches the screen and the redirect is itself the decision.
      if (process.stdout.isTTY && !opts.yes) {
        const ok = await confirm('Type "yes" to print the private key: ');
        if (!ok) throw new Error("Cancelled. Nothing was printed.");
      }

      const passphrase = await resolvePassphrase(opts);
      const { privateKeyHex, address } = await exportPrivateKey(
        keystore,
        passphrase,
      );

      note(`Private key for ${address}:`);
      out(privateKeyHex);
    }),
  );

/* --------------------------------- sign-tx --------------------------------- */

program
  .command("sign-tx")
  .description(
    "Sign an unsigned transaction returned by the did:isbe API (reads stdin by default)",
  )
  .addOption(curveOption)
  .option("-f, --tx-file <file>", "Read the unsigned transaction from a file")
  .option("--tx <json>", "Unsigned transaction as a JSON string")
  .option("--json", "Emit a JSON object instead of the bare signed payload")
  .action(async (opts) =>
    run(async () => {
      const curve = parseCurve(opts.curve);
      // The transaction is read first: no point decrypting a key for a
      // payload that turns out to be malformed.
      const tx = await readUnsignedTx(opts);

      await withSigner({ ...opts, curve }, async (signer) => {
        const result = await signTransaction(signer, tx);

        if (opts.json) {
          out(JSON.stringify(result, null, 2));
          return;
        }
        note(`Signed by ${result.from} -> ${result.to}`);
        out(result.signedRawTransaction);
      });
    }),
  );
addKeySourceOptions(program.commands[program.commands.length - 1]);

/* ----------------------------------- main ---------------------------------- */

program.addHelpText(
  "after",
  `
Key sources (pick one):
  --keystore <file>     Encrypted keystore. Recommended.
  --priv-key-stdin      Private key hex on stdin, for scripting.
  --privKey <hex>       Deprecated: lands in shell history and is visible via ps.

Passphrases are read from the terminal without echo. For unattended runs set
${PASSPHRASE_ENV}, and only from a secret manager - environment variables are
readable by child processes.

Examples:
  did-gen keys --out ./identity.keystore.json
  did-gen did --keystore ./identity.keystore.json
  did-gen sign-tx --keystore ./identity.keystore.json < unsigned-tx.json
  did-gen export-key --keystore ./identity.keystore.json | pbcopy
`,
);

program.showHelpAfterError(true);

if (!process.argv.slice(2).length) {
  program.outputHelp();
} else {
  program.parseAsync(process.argv).catch((err) => {
    fail(err?.message || String(err));
    process.exitCode = 1;
  });
}
