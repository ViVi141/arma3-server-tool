export function isElectron(): boolean {
  return !!window.electronAPI?.isElectron;
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
