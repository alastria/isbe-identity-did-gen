'use strict';

// Pure, dependency-free helpers, independently testable without Electron.
function humanNumber(value) {
  if (value === undefined || value === null) return 'Not specified';
  return String(value);
}

function summarizeTransaction(tx) {
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) {
    throw new Error('Invalid transaction');
  }
  const data = typeof tx.data === 'string' ? tx.data : '0x';
  if (!/^0x(?:[a-fA-F0-9]{2})*$/.test(data)) {
    throw new Error('Transaction calldata is invalid hex.');
  }
  return Object.freeze({
    from: typeof tx.from === 'string' ? tx.from : 'Not specified',
    to: String(tx.to),
    chainId: humanNumber(tx.chainId),
    nonce: humanNumber(tx.nonce),
    value: humanNumber(tx.value ?? '0'),
    gasLimit: humanNumber(tx.gasLimit),
    gasPrice: humanNumber(tx.gasPrice),
    maxFeePerGas: humanNumber(tx.maxFeePerGas),
    maxPriorityFeePerGas: humanNumber(tx.maxPriorityFeePerGas),
    type: humanNumber(tx.type),
    selector: data.length >= 10 ? data.slice(0, 10) : 'None',
    calldataBytes: (data.length - 2) / 2,
  });
}

function reviewText(summary, signerAddress) {
  return [
    `Signing account: ${signerAddress}`,
    `Chain ID: ${summary.chainId}`,
    `Destination: ${summary.to}`,
    `Value (wei): ${summary.value}`,
    `Nonce: ${summary.nonce}`,
    `Gas limit: ${summary.gasLimit}`,
    `Function selector: ${summary.selector}`,
    `Calldata: ${summary.calldataBytes} bytes`,
    '',
    'Check the chain and destination carefully. The application cannot verify',
    'what this smart-contract call will do. No transaction will be broadcast.',
  ].join('\n');
}

module.exports = { summarizeTransaction, reviewText };
