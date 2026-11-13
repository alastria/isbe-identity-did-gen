#!/usr/bin/env node
/* Build the unchanged root library and install its packed output into the desktop app.
 * A tarball (rather than an npm file: directory symlink) makes packaged apps
 * independent of the source checkout and works across operating systems.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const desktop = path.resolve(__dirname, '..');
const root = path.resolve(desktop, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isbe-did-gen-pack-'));
const coreDir = path.join(desktop, '.core');

function run(args, cwd, capture = false) {
  // Windows needs a shell to execute npm.cmd; the arguments are internal and fixed.
  const result = spawnSync(npm, args, {
    cwd, shell: process.platform === 'win32',
    encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args[0]} failed (exit ${result.status}).`);
  return result.stdout;
}

// The CLI tarball is rebuilt from this checkout on every run, so a pinned hash for it
// would change with every CLI edit and make npm reject the lockfile (EINTEGRITY).
// Only that entry loses its hash; every registry dependency stays pinned.
function dropLocalIntegrity() {
  const file = path.join(desktop, 'package-lock.json');
  if (!fs.existsSync(file)) return;
  const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entry = lock.packages?.['node_modules/isbe-did-gen'];
  if (!entry?.integrity) return;
  delete entry.integrity;
  fs.writeFileSync(file, JSON.stringify(lock, null, 2) + '\n');
}

try {
  if (!fs.existsSync(path.join(root, 'node_modules', 'typescript'))) {
    throw new Error('Install the existing CLI dependencies first: npm ci (in the repository root).');
  }
  run(['run', 'build'], root);
  for (const file of ['dist/signer.js', 'dist/commands/signTx.js', 'dist/keystore.js']) {
    if (!fs.existsSync(path.join(root, file))) {
      throw new Error(`The CLI build is missing ${file}`);
    }
  }
  fs.mkdirSync(coreDir, { recursive: true });
  const packed = JSON.parse(run([
    'pack', '--ignore-scripts', '--json', '--pack-destination', tmp,
  ], root, true));
  if (packed.length !== 1 || !packed[0]?.filename) {
    throw new Error('Unexpected npm pack output.');
  }
  fs.copyFileSync(path.join(tmp, packed[0].filename), path.join(coreDir, 'isbe-did-gen.tgz'));
  // npm may retain a previously installed local tarball. Force a fresh copy
  // when the root code changes without a package version bump.
  fs.rmSync(path.join(desktop, 'node_modules', 'isbe-did-gen'), { recursive: true, force: true });
  dropLocalIntegrity();
  run(['install', '--no-audit', '--no-fund'], desktop);
  dropLocalIntegrity();
  console.log('\nDesktop app ready. Run: npm --prefix desktop start');
} catch (error) {
  console.error('\nDesktop bootstrap failed:', error.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
