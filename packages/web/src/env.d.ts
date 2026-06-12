/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

interface ServiceSettings {
  port: number;
  host: string;
  apiToken: string;
  remoteAccessEnabled: boolean;
}

interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  getServiceSettings: () => Promise<ServiceSettings>;
  saveServiceSettings: (settings: ServiceSettings) => Promise<void>;
  getServiceStatus: () => Promise<{ running: boolean; pid?: number }>;
  restartService: () => Promise<{ running: boolean; pid?: number }>;
  openFile: (options: { filters: { name: string; extensions: string[] }[] }) => Promise<string | undefined>;
  openPath: (targetPath: string) => Promise<string>;
  showOpenDialog: (options: { properties: string[] }) => Promise<{ canceled: boolean; filePaths: string[] }>;
  getAppVersion: () => Promise<string>;
  getAppPath: () => Promise<string>;
}

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string;
  readonly VITE_DEFAULT_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  electronAPI?: ElectronAPI;
}
