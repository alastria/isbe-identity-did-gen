'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { findSignLink, parseSignLink } = require('../sign-link.cjs');

const tx = { from: '0x1111111111111111111111111111111111111111', to: '0x2222222222222222222222222222222222222222', chainId: '0x2b41', nonce: '0x8', data: '0x12345678' };
const link = (json) => `isbe-didgen://sign?tx=${Buffer.from(json).toString('base64url')}`;

test('a sign link yields the transaction JSON exactly as sent', () => {
  const json = JSON.stringify(tx);
  assert.equal(parseSignLink(link(json)), json);
  assert.equal(parseSignLink(link(json).replace('sign?', 'sign/?')), json);
});

test('links of another scheme, action or shape are refused', () => {
  const encoded = Buffer.from(JSON.stringify(tx)).toString('base64url');
  for (const bad of [
    `https://sign?tx=${encoded}`,
    `isbe-didgen://export?tx=${encoded}`,
    `isbe-didgen://sign/other?tx=${encoded}`,
    'isbe-didgen://sign',
    'isbe-didgen://sign?tx=not+base64url',
    'not a url',
    undefined,
  ]) {
    assert.throws(() => parseSignLink(bad), undefined, String(bad));
  }
});

test('oversized links are refused before decoding', () => {
  assert.throws(() => parseSignLink(link('x'.repeat(20_000))), /too long/);
});

test('the link is found among launch arguments', () => {
  assert.equal(findSignLink(['/app', '--flag', 'isbe-didgen://sign?tx=e30']), 'isbe-didgen://sign?tx=e30');
  assert.equal(findSignLink(['/app', 'https://example.org']), null);
  assert.equal(findSignLink(undefined), null);
});

test('installers register the isbe-didgen scheme and ship the parser', () => {
  const { build } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  assert.deepEqual(build.protocols.flatMap((p) => p.schemes), ['isbe-didgen']);
  assert.ok(build.files.includes('sign-link.cjs'));
});
