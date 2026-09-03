export function isElectron(): boolean {
  return !!window.electronAPI?.isElectron;
}

/** Electron 外壳在跑，但 preload 未注入（常见于旧安装包 ESM preload 失败）。 */
export function isElectronShellWithoutBridge(): boolean {
  if (isElectron()) {
    return false;
  }
  return /Electron/i.test(navigator.userAgent);
}

export async function openPath(targetPath: string): Promise<boolean> {
  if (!targetPath || !window.electronAPI?.openPath) {
    return false;
  }
  const result = await window.electronAPI.openPath(targetPath);
  return result === "";
}

export async function pickDirectory(): Promise<string | null> {
  if (!window.electronAPI?.showOpenDialog) {
    return null;
  }
  const result = await window.electronAPI.showOpenDialog({ properties: ["openDirectory"] });
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
}

export async function pickFile(
  filters?: { name: string; extensions: string[] }[]
): Promise<string | null> {
  if (!window.electronAPI?.showOpenDialog) {
    return null;
  }
  const options: { properties: string[]; filters?: { name: string; extensions: string[] }[] } = {
    properties: ["openFile"],
  };
  if (filters && filters.length > 0) {
    options.filters = filters;
  }
  const result = await window.electronAPI.showOpenDialog(options);
  if (result.canceled || !result.filePaths.length) {
    return null;
  }
  return result.filePaths[0];
}

export async function readTextFile(filePath: string): Promise<string | null> {
  if (!filePath || !window.electronAPI?.readTextFile) {
    return null;
  }
  try {
    return await window.electronAPI.readTextFile(filePath);
  } catch {
    return null;
  }
}
