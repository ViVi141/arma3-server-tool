import { contextBridge, ipcRenderer } from "electron";

export interface ServiceSettings {
  port: number;
  host: string;
  apiToken: string;
  remoteAccessEnabled: boolean;
}

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isElectron: true,

  getServiceSettings: (): Promise<ServiceSettings> => ipcRenderer.invoke("service:settings:get"),
  saveServiceSettings: (settings: ServiceSettings): Promise<void> =>
    ipcRenderer.invoke("service:settings:save", settings),
  getServiceStatus: (): Promise<{ running: boolean; pid?: number }> =>
    ipcRenderer.invoke("service:status"),
  restartService: (): Promise<{ running: boolean; pid?: number }> =>
    ipcRenderer.invoke("service:restart"),

  openFile: (options: { filters: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke("dialog:openFile", options),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke("app:version"),
  getAppPath: (): Promise<string> => ipcRenderer.invoke("app:path"),

  openPath: (targetPath: string): Promise<string> => ipcRenderer.invoke("shell:openPath", targetPath),
  showOpenDialog: (options: { properties: string[] }): Promise<{ canceled: boolean; filePaths: string[] }> =>
    ipcRenderer.invoke("dialog:openFile", options),

  getThemeDark: (): Promise<boolean> => ipcRenderer.invoke("theme:shouldUseDarkColors"),
  onThemeChanged: (callback: (dark: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, dark: boolean) => {
      callback(dark);
    };
    ipcRenderer.on("theme:changed", handler);
    return () => {
      ipcRenderer.removeListener("theme:changed", handler);
    };
  },
});
