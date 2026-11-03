'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const {
  app, BrowserWindow, dialog, ipcMain, clipboard, protocol, net, session,
} = require('electron');
const core = require('./core.cjs');
const { summarizeTransaction, reviewText } = require('./transaction-display.cjs');
const { SCHEME, findSignLink, parseSignLink } = require('./sign-link.cjs');

// A dedicated privileged local origin, with an explicit asset allowlist.
// No HTTP server, remote assets, APIs, telemetry or auto-update network calls.
protocol.registerSchemesAsPrivileged([{ scheme: 'isbe-app', privileges: {
  standard: true, secure: true, supportFetchAPI: true, stream: true,
} }]);

let window;
// A link that arrived before the window could show it (macOS delivers it before ready).
let pendingLink = findSignLink(process.argv);
// isLoading() can still be true inside did-finish-load: track readiness explicitly.
let rendererReady = false;
const state = {
  keystore: null,
  unsigned: null,
  unsignedHash: null,
  generateOutput: null,
  importOutput: null,
  signed: null,
  exportedKey: null,
};

function assertSender(event) {
  if (!window || event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url !== 'isbe-app://local/index.html') {
    throw new Error('Unauthorized application request.');
  }
}

function endpoint(name, handler) {
  ipcMain.handle('didgen:' + name, async (event, ...args) => {
    assertSender(event);
    return handler(...args);
  });
}

function requiredFile(file, message) {
  if (!file) throw new Error(message);
  return file;
}

function inspectUnsigned(file) {
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 1024 * 1024) {
    throw new Error('Select an unsigned JSON transaction smaller than 1 MB.');
  }
  return inspectRaw(fs.readFileSync(file, 'utf8'));
}

function inspectRaw(raw) {
  const tx = core.parseUnsignedTx(raw);
  if (tx.chainId === undefined || tx.chainId === null || Number(tx.chainId) <= 0 ||
      !Number.isSafeInteger(Number(tx.chainId))) {
    throw new Error('A valid chainId is required for safe transaction signing.');
  }
  return {
    tx, summary: summarizeTransaction(tx),
    hash: createHash('sha256').update(raw).digest('hex'),
  };
}

// state.unsigned is { file } for a file picked from disk, { raw } for a sign link.
function sameTransaction() {
  const source = requiredFile(state.unsigned, 'Select an unsigned transaction first.');
  // A link's transaction lives only in memory: nothing else can change it.
  if (source.raw !== undefined) return inspectRaw(source.raw);
  const result = inspectUnsigned(source.file);
  if (result.hash !== state.unsignedHash) {
    state.unsignedHash = null;
    throw new Error('The unsigned transaction changed on disk. Select it again before signing.');
  }
  return result;
}

function registerHandlers() {
  endpoint('select-keystore', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Select an encrypted Web3 keystore',
      properties: ['openFile'],
      filters: [{ name: 'JSON keystore', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const selected = result.filePaths[0];
    // Bound disk input before parsing potentially untrusted keystore JSON.
    const stat = fs.statSync(selected);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) {
      throw new Error('Select a JSON keystore smaller than 2 MB.');
    }
    // Reject malformed files before accepting the selection.
    const json = JSON.parse(fs.readFileSync(selected, 'utf8'));
    if (!json || json.version !== 3 || !json.crypto && !json.Crypto) {
      throw new Error('Select a Web3 Secret Storage v3 JSON keystore.');
    }
    state.keystore = selected;
    state.signed = null;
    return { name: path.basename(selected), path: selected };
  });

  endpoint('select-unsigned', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Select an unsigned transaction from ISBE',
      properties: ['openFile'],
      filters: [{ name: 'JSON transaction', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const selected = result.filePaths[0];
    const inspected = inspectUnsigned(selected);
    state.unsigned = { file: selected };
    state.unsignedHash = inspected.hash;
    state.signed = null;
    return { name: path.basename(selected), path: selected, summary: inspected.summary };
  });

  endpoint('choose-output', async (kind) => {
    if (!['generate', 'import'].includes(kind)) throw new Error('Invalid save operation.');
    const result = await dialog.showSaveDialog(window, {
      title: 'Save encrypted keystore',
      defaultPath: 'identity.keystore.json',
      filters: [{ name: 'JSON keystore', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    // The underlying writer uses exclusive file creation (wx).
    if (fs.existsSync(result.filePath)) {
      throw new Error('This file already exists. Select a new filename; existing keystores are never overwritten.');
    }
    if (kind === 'generate') state.generateOutput = result.filePath;
    else state.importOutput = result.filePath;
    return { name: path.basename(result.filePath), path: result.filePath };
  });

  endpoint('generate', async (password) => {
    const filename = requiredFile(state.generateOutput, 'Choose where to save the keystore.');
    const artifacts = await core.generateIdentity(filename, password);
    state.generateOutput = null;
    return { ...artifacts, file: path.basename(filename) };
  });

  endpoint('did', async (password, modelDeploy) => {
    return core.generateDid(
      requiredFile(state.keystore, 'Select a keystore first.'), password, modelDeploy,
    );
  });

  endpoint('sign', async (password) => {
    const keystore = requiredFile(state.keystore, 'Select a keystore first.');
    // A link can replace state.unsigned while the dialog is open: remember what was shown.
    const fromLink = state.unsigned?.raw !== undefined;
    const { tx, summary } = sameTransaction();
    // Native confirmation is intentionally performed in the main process,
    // independent of the renderer's form validation and display.
    const confirmed = await dialog.showMessageBox(window, {
      type: 'warning', title: 'Review before signing',
      message: 'Approve this offline signature?',
      detail: reviewText(summary, tx.from ?? 'Keystore account (validated during signing)'),
      buttons: ['Cancel', 'Sign transaction'],
      defaultId: 0, cancelId: 0, noLink: true,
    });
    if (confirmed.response !== 1) return null;
    const result = await core.signLocal(keystore, password, tx);
    state.signed = result.signedRawTransaction;
    // Whoever sent the link is waiting to paste it back: not a secret, so it stays there.
    if (fromLink) {
      clipboard.writeText(result.signedRawTransaction);
      return { ...result, copied: true };
    }
    return result;
  });

  endpoint('save-signed', async (format = 'hex') => {
    if (!state.signed) throw new Error('Sign a transaction first.');
    if (!['hex', 'json'].includes(format)) throw new Error('Invalid export format.');
    const isJson = format === 'json';
    const result = await dialog.showSaveDialog(window, {
      title: isJson ? 'Save API request JSON' : 'Export signed raw transaction',
      defaultPath: isJson ? 'signed-request.json' : 'signed.hex',
      filters: isJson ? [{ name: 'JSON request', extensions: ['json'] }]
                      : [{ name: 'Signed payload', extensions: ['hex', 'txt'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const content = isJson ? JSON.stringify({ signedRawTransaction: state.signed }, null, 2) : state.signed;
    try {
      fs.writeFileSync(result.filePath, content + '\n', {
        encoding: 'utf8', mode: 0o600, flag: 'wx',
      });
    } catch (error) {
      // The native dialog may already have asked "Replace?"; we still never overwrite.
      if (error.code === 'EEXIST') throw new Error('This file already exists. Choose a new filename.');
      throw error;
    }
    return result.filePath;
  });

  endpoint('import', async (privateKey, password) => {
    const filename = requiredFile(state.importOutput, 'Choose where to save the imported keystore.');
    const artifacts = await core.importIdentity(filename, privateKey, password);
    state.importOutput = null;
    return { ...artifacts, file: path.basename(filename) };
  });

  endpoint('export', async (password) => {
    const keystore = requiredFile(state.keystore, 'Select a keystore first.');
    const choice = await dialog.showMessageBox(window, {
      type: 'warning', title: 'Export unencrypted private key',
      message: 'Reveal your raw private key?',
      detail: 'Anyone with this key can control your identity. Do not share it, take a screenshot, or paste it into an untrusted application.',
      buttons: ['Cancel', 'Reveal private key'],
      defaultId: 0, cancelId: 0, noLink: true,
    });
    if (choice.response !== 1) return null;
    state.exportedKey = null;
    const result = await core.exportKey(keystore, password);
    state.exportedKey = result.privateKeyHex;
    // The main process forgets it after 30 seconds; the UI also clears its copy.
    setTimeout(() => {
      if (state.exportedKey === result.privateKeyHex) state.exportedKey = null;
    }, 30_000).unref();
    return result;
  });

  endpoint('copy', async (value, secret) => {
    if (typeof value !== 'string' || value.length > 1024 * 1024) {
      throw new Error('Invalid clipboard content.');
    }
    if (secret && (!state.exportedKey || value !== state.exportedKey)) {
      throw new Error('The private-key export has expired.');
    }
    clipboard.writeText(value);
    if (secret) {
      setTimeout(() => {
        if (clipboard.readText() === value) clipboard.clear();
      }, 30_000).unref();
    }
    return true;
  });
}

/** Loads a sign link for review; signing still goes through the sign form. */
function openSignLink(link) {
  if (!window || window.isDestroyed() || !rendererReady) {
    pendingLink = link;
    return;
  }
  pendingLink = null;
  if (window.isMinimized()) window.restore();
  window.focus();
  try {
    const raw = parseSignLink(link);
    const inspected = inspectRaw(raw);
    state.unsigned = { raw };
    state.unsignedHash = inspected.hash;
    state.signed = null;
    window.webContents.send('didgen:sign-link', { summary: inspected.summary });
  } catch (error) {
    window.webContents.send('didgen:sign-link', { error: error.message });
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1120, height: 820, minWidth: 790, minHeight: 650,
    backgroundColor: '#0a1121',
    show: false,
    title: 'ISBE DID Generator',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      // DevTools could read passwords and exported keys from the renderer.
      devTools: !app.isPackaged,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());
  window.webContents.on('did-finish-load', () => {
    rendererReady = true;
    if (pendingLink) openSignLink(pendingLink);
  });
  window.loadURL('isbe-app://local/index.html');
}

// One window per user: a second instance would hold its own keystore state.
// quit() is asynchronous, so a second instance must not go on to register handlers
// and open a window of its own before it exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (!window || window.isDestroyed()) return;
    const link = findSignLink(argv);
    if (link) return openSignLink(link);
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  // macOS hands links to the running app, also the one that launched it.
  app.on('open-url', (event, link) => {
    event.preventDefault();
    openSignLink(link);
  });
  // Only installed builds claim the scheme: under `npm start` the handler would be the stock
  // Electron binary, system-wide, which opens its demo window instead of this app.
  if (app.isPackaged) app.setAsDefaultProtocolClient(SCHEME);

  app.whenReady().then(() => {
    // Packaged builds take the icon from the bundle; `npm start` runs the stock Electron binary.
    if (!app.isPackaged && process.platform === 'darwin') {
      app.dock.setIcon(path.join(__dirname, 'build', 'icon.png'));
    }
    const assets = new Map([
      ['/index.html', 'index.html'],
      ['/app.js', 'app.js'],
      ['/styles.css', 'styles.css'],
      ['/icon.svg', 'icon.svg'],
    ]);
    protocol.handle('isbe-app', (request) => {
      const url = new URL(request.url);
      if (url.hostname !== 'local' || !assets.has(url.pathname)) {
        return new Response('Not Found', { status: 404 });
      }
      return net.fetch(pathToFileURL(path.join(__dirname, 'renderer', assets.get(url.pathname))).toString());
    });
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    registerHandlers();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch((error) => {
    dialog.showErrorBox('Could not start ISBE DID Generator', error.message);
    app.quit();
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
