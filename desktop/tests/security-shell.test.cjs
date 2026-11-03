'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'main.cjs'), 'utf8');
const html = fs.readFileSync(path.join(root, 'renderer/index.html'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.cjs'), 'utf8');

test('Electron renderer uses sandbox and isolation with Node disabled', () => {
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /webSecurity:\s*true/);
  assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
});

test('UI has a restrictive CSP and no inline script', () => {
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /<script(?![^>]+src=)/);
});

test('all five existing CLI operations have a UI', () => {
  for (const name of ['generate', 'did', 'sign', 'import', 'export']) {
    assert.ok(html.includes(`id="${name}-form"`));
    assert.ok(preload.includes(`didgen:${name === 'import' ? 'import' : name}`));
  }
});

test('packaged builds disable DevTools and run with one instance', () => {
  assert.match(main, /devTools:\s*!app\.isPackaged/);
  assert.match(main, /requestSingleInstanceLock\(\)/);
});

test('macOS hardened runtime grants only the JIT entitlement', () => {
  const plist = fs.readFileSync(path.join(root, 'build/entitlements.mac.plist'), 'utf8');
  const keys = [...plist.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['com.apple.security.cs.allow-jit']);
  const { build } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(build.mac.hardenedRuntime, true);
  assert.equal(build.mac.entitlements, 'build/entitlements.mac.plist');
});
