import { contextBridge as o, ipcRenderer as e } from "electron";
o.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isElectron: !0,
  getServiceSettings: () => e.invoke("service:settings:get"),
  saveServiceSettings: (t) => e.invoke("service:settings:save", t),
  getServiceStatus: () => e.invoke("service:status"),
  restartService: () => e.invoke("service:restart"),
  openFile: (t) => e.invoke("dialog:openFile", t),
  getAppVersion: () => e.invoke("app:version"),
  getAppPath: () => e.invoke("app:path"),
  openPath: (t) => e.invoke("shell:openPath", t),
  showOpenDialog: (t) => e.invoke("dialog:openFile", t),
  readTextFile: (t) => e.invoke("fs:readTextFile", t),
  getThemeDark: () => e.invoke("theme:shouldUseDarkColors"),
  onThemeChanged: (t) => {
    const i = (r, n) => {
      t(n);
    };
    return e.on("theme:changed", i), () => {
      e.removeListener("theme:changed", i);
    };
  }
});
