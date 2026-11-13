'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Narrow, named methods only. Never expose ipcRenderer, Node APIs, or file I/O.
contextBridge.exposeInMainWorld('didgen', Object.freeze({
  selectKeystore: () => ipcRenderer.invoke('didgen:select-keystore'),
  selectUnsigned: () => ipcRenderer.invoke('didgen:select-unsigned'),
  chooseOutput: (kind) => ipcRenderer.invoke('didgen:choose-output', kind),
  generate: (password) => ipcRenderer.invoke('didgen:generate', password),
  did: (password, model) => ipcRenderer.invoke('didgen:did', password, model),
  sign: (password) => ipcRenderer.invoke('didgen:sign', password),
  saveSigned: (format) => ipcRenderer.invoke('didgen:save-signed', format),
  importKey: (privateKey, password) => ipcRenderer.invoke('didgen:import', privateKey, password),
  exportKey: (password) => ipcRenderer.invoke('didgen:export', password),
  copy: (value, isSecret = false) => ipcRenderer.invoke('didgen:copy', value, isSecret),
  // Only the summary or error the main process derived from an isbe-didgen://sign link.
  onSignLink: (callback) => ipcRenderer.on('didgen:sign-link', (_event, payload) => callback(payload)),
}));
