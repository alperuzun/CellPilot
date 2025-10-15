// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';
console.log('preload.ts loaded');
contextBridge.exposeInMainWorld('backend', {
  /** Returns the absolute path of the chosen .h5ad (or undefined if cancelled) */
  openAdataFile: () => ipcRenderer.invoke('dialog:openAdata'),
  /** Opens a directory picker – returns absolute path or undefined */
  openDir:      () => ipcRenderer.invoke('dialog:openDir'),
  /** Opens a marker gene file picker – returns absolute path or undefined */
  openMarkerFile: () => ipcRenderer.invoke('dialog:openMarkerFile'),
  /** Get file stats (size, dates) for a given path */
  getFileStats: (filePath: string) => ipcRenderer.invoke('fs:getFileStats', filePath),
  imageDataURL: (path: string) => ipcRenderer.invoke('image-data-url', path),
});
