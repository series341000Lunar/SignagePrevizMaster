'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('luuxProject', Object.freeze({
  saveAs: (payload) => ipcRenderer.invoke('luux-project:save-as', payload),
  save: (payload) => ipcRenderer.invoke('luux-project:save', payload),
  open: () => ipcRenderer.invoke('luux-project:open'),
  openDroppedManifest: (file) => {
    try {
      return ipcRenderer.invoke('luux-project:open-dropped-manifest', webUtils.getPathForFile(file));
    } catch (error) {
      return Promise.resolve({
        ok: false,
        error: {
          code: 'PROJECT_MANIFEST_PATH_INVALID',
          message: error?.message || String(error),
          details: null
        }
      });
    }
  },
  acceptOpen: (token) => ipcRenderer.invoke('luux-project:accept-open', token),
  cancelOpen: (token) => ipcRenderer.invoke('luux-project:cancel-open', token),
  getState: () => ipcRenderer.invoke('luux-project:get-state')
}));
