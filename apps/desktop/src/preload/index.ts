import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isElectron: true,

  // Service lifecycle
  getServiceStatus: () => ipcRenderer.invoke("service:status"),
  restartService: () => ipcRenderer.invoke("service:restart"),

  // File dialogs
  openFile: (options: { filters: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke("dialog:openFile", options),

  // App info
  getAppVersion: () => ipcRenderer.invoke("app:version"),
  getAppPath: () => ipcRenderer.invoke("app:path"),
});
