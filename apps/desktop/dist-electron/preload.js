import { contextBridge as i, ipcRenderer as e } from "electron";
i.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isElectron: !0,
  getServiceSettings: () => e.invoke("service:settings:get"),
  saveServiceSettings: (t) => e.invoke("service:settings:save", t),
  getServiceStatus: () => e.invoke("service:status"),
  restartService: () => e.invoke("service:restart"),
  openFile: (t) => e.invoke("dialog:openFile", t),
  getAppVersion: () => e.invoke("app:version"),
  getAppPath: () => e.invoke("app:path")
});
