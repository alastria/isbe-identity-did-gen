'use strict';

// Import the exact compiled CLI logic installed from the root npm tarball.
// Never import its dist/index.js: doing so would execute the Commander CLI.
const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const { timingSafeEqual } = require('node:crypto');
const { LocalKeySigner, readKeystoreFile, writeKeystoreFile } = require('isbe-did-gen/dist/signer');
const { decryptKeystore, encryptKeystore } = require('isbe-did-gen/dist/keystore');
const { generatePrivateKey, derivePublicArtifacts } = require('isbe-did-gen/dist/commands/keys');
const { proofFromSigner, buildDID } = require('isbe-did-gen/dist/commands/did');
const { parseUnsignedTx, signTransaction } = require('isbe-did-gen/dist/commands/signTx');
const { exportPrivateKey } = require('isbe-did-gen/dist/commands/exportKey');
const { normalizePrivKey, wipe } = require('isbe-did-gen/dist/utils');

function checkPassword(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 8 || passphrase.length > 1024) {
    throw new Error('Use a keystore password between 8 and 1024 characters.');
  }
}
function checkPasswordProvided(passphrase) {
  if (typeof passphrase !== 'string' || !passphrase || passphrase.length > 1024) {
    throw new Error('Enter your keystore password.');
  }
}
function checkModel(modelDeploy) {
  if (!['uc', 'uc-pre'].includes(modelDeploy)) {
    throw new Error('Select PRE or PRO.');
  }
}

async function withKeystore(keystorePath, passphrase, callback) {
  checkPasswordProvided(passphrase);
  const { privateKey, curve } = await decryptKeystore(readKeystoreFile(keystorePath), passphrase);
  let signer;
  try {
    signer = new LocalKeySigner(privateKey, curve);
    return await callback(signer);
  } finally {
    wipe(privateKey);
    if (signer) signer.destroy();
  }
}

async function generateIdentity(outPath, passphrase) {
  checkPassword(passphrase);
  const key = generatePrivateKey('secp256k1');
  try {
    const json = await encryptKeystore(key, passphrase, 'secp256k1');
    const artifacts = await derivePublicArtifacts(key, 'secp256k1');
    writeKeystoreFile(outPath, json); // exclusive, 0600; never overwrite
    return artifacts;
  } finally {
    wipe(key);
  }
}

async function generateDid(keystorePath, passphrase, modelDeploy) {
  checkModel(modelDeploy);
  return withKeystore(keystorePath, passphrase, async (signer) => {
    const proof = proofFromSigner(signer);
    return {
      did: buildDID(proof, modelDeploy),
      publicKey: signer.getPublicKey(),
      proof,
      eoa: await signer.getAddress(),
      curve: signer.curve,
    };
  });
}

async function importIdentity(outPath, privateKeyText, passphrase) {
  checkPassword(passphrase);
  if (typeof privateKeyText !== 'string' || privateKeyText.length > 140) {
    throw new Error('Enter a valid 32-byte private key.');
  }
  const key = Buffer.from(normalizePrivKey(privateKeyText.trim()), 'hex');
  let written = false;
  try {
    const json = await encryptKeystore(key, passphrase, 'secp256k1');
    const artifacts = await derivePublicArtifacts(key, 'secp256k1');
    writeKeystoreFile(outPath, json);
    written = true;
    // Verify imported key can be decrypted back from its actual saved file.
    const verified = await decryptKeystore(readKeystoreFile(outPath), passphrase);
    try {
      if (!timingSafeEqual(key, verified.privateKey)) {
        throw new Error('Saved keystore does not match the imported key.');
      }
    } finally {
      wipe(verified.privateKey);
    }
    return artifacts;
  } catch (error) {
    // Only remove files we created. writeKeystoreFile refuses existing paths.
    if (written) fs.unlinkSync(outPath);
    throw error;
  } finally {
    wipe(key);
  }
}

async function signLocal(keystorePath, passphrase, unsignedTx) {
  return withKeystore(keystorePath, passphrase, async (signer) => {
    return signTransaction(signer, unsignedTx);
  });
}

async function exportKey(keystorePath, passphrase) {
  checkPasswordProvided(passphrase);
  return exportPrivateKey(readKeystoreFile(keystorePath), passphrase);
}

module.exports = {
  generateIdentity, generateDid, importIdentity, signLocal, exportKey,
  parseUnsignedTx, withKeystore,
};
