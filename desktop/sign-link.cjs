'use strict';

// Pure, dependency-free helpers, independently testable without Electron.
// A sign link carries one unsigned transaction: isbe-didgen://sign?tx=<base64url JSON>.
// Any web page can open it, so it is as untrusted as a file picked from disk: it only
// preloads the review, and signing still needs the keystore password and the native
// confirmation. Nothing is ever sent back over the network.

const SCHEME = 'isbe-didgen';
// Far above any registry transaction, far below what an OS passes as a launch argument.
const MAX_LINK_LENGTH = 16 * 1024;

function findSignLink(argv) {
  if (!Array.isArray(argv)) return null;
  return argv.find((arg) => typeof arg === 'string' && arg.startsWith(`${SCHEME}://`)) ?? null;
}

/** Returns the transaction JSON text the link carries, or throws a user-facing error. */
function parseSignLink(link) {
  if (typeof link !== 'string' || link.length > MAX_LINK_LENGTH) {
    throw new Error('The signing link is missing or too long.');
  }
  let url;
  try { url = new URL(link); } catch { throw new Error('The signing link is not a valid URL.'); }
  if (url.protocol !== `${SCHEME}:` || url.hostname !== 'sign' || !['', '/'].includes(url.pathname)) {
    throw new Error('Unsupported link: only isbe-didgen://sign links can be opened.');
  }
  const encoded = url.searchParams.get('tx');
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('The signing link carries no transaction.');
  }
  return Buffer.from(encoded, 'base64url').toString('utf8');
}

module.exports = { SCHEME, findSignLink, parseSignLink };
