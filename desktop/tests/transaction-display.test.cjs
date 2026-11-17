'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeTransaction, reviewText } = require('../transaction-display.cjs');

test('transaction preview includes the fields relevant to signing', () => {
  const result = summarizeTransaction({
    from: '0x1111111111111111111111111111111111111111',
    to: '0x2222222222222222222222222222222222222222',
    chainId: 11073, nonce: 3, value: 0,
    data: '0x12345678abcdef', gasLimit: '250000',
  });
  assert.equal(result.chainId, '11073');
  assert.equal(result.selector, '0x12345678');
  assert.equal(result.calldataBytes, 7);
  assert.equal(result.gasLimit, '250000');
  assert.match(reviewText(result, '0x1111'), /Chain ID: 11073/);
  assert.match(reviewText(result, '0x1111'), /will be broadcast/);
});

test('no calldata and no optional fields are shown clearly', () => {
  const result = summarizeTransaction({ to: '0x0000000000000000000000000000000000000000' });
  assert.equal(result.selector, 'None');
  assert.equal(result.calldataBytes, 0);
  assert.equal(result.chainId, 'Not specified');
  assert.equal(result.value, '0');
});

test('malformed transaction data is rejected for previews', () => {
  for (const data of ['0xgg', '0x0', 'abc', '0x133']) {
    assert.throws(() => summarizeTransaction({ to: '0x1234', data }), /invalid hex/);
  }
  assert.throws(() => summarizeTransaction(null), /Invalid transaction/);
});
