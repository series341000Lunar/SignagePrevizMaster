'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('luuxProject', Object.freeze({
  saveAs: (payload) => ipcRenderer.invoke('luux-project:save-as', payload),
  save: (payload) => ipcRenderer.invoke('luux-project:save', payload),
  open: () => ipcRenderer.invoke('luux-project:open'),
  acceptOpen: (token) => ipcRenderer.invoke('luux-project:accept-open', token),
  cancelOpen: (token) => ipcRenderer.invoke('luux-project:cancel-open', token),
  getState: () => ipcRenderer.invoke('luux-project:get-state')
}));
