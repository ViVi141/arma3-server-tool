import * as path from "node:path";

export function isWindows(): boolean {
  return process.platform === "win32";
}

export function isLinux(): boolean {
  return process.platform === "linux";
}

/** Dedicated server binary file name for the given bitness. */
export function serverExecutableName(x64: boolean): string {
  if (isLinux()) {
    if (x64) {
      return "arma3server_x64";
    }
    return "arma3server";
  }
  if (x64) {
    return "arma3server_x64.exe";
  }
  return "arma3server.exe";
}

export function isKnownServerExecutable(fileName: string): boolean {
  const base = path.basename(fileName.replace(/\\/g, "/")).toLowerCase();
  return (
    base === "arma3server" ||
    base === "arma3server_x64" ||
    base === "arma3server.exe" ||
    base === "arma3server_x64.exe"
  );
}

/** Default dedicated server binary name after Steam app 233780 install. */
export function defaultServerExecutable(): string {
  return serverExecutableName(true);
}

export function defaultServerDir(): string {
  if (isLinux()) {
    return "/opt/arma3server";
  }
  return "C:\\arma3";
}

export const STEAMCMD_WIN_URL =
  "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";
export const STEAMCMD_LINUX_URL =
  "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz";

export function steamCmdDownloadUrl(): string {
  if (isLinux()) {
    return STEAMCMD_LINUX_URL;
  }
  return STEAMCMD_WIN_URL;
}

export function steamCmdArchiveFileName(): string {
  if (isLinux()) {
    return "steamcmd_linux.tar.gz";
  }
  return "steamcmd.zip";
}

export function steamCmdEntryName(): string {
  if (isLinux()) {
    return "steamcmd.sh";
  }
  return "steamcmd.exe";
}

export function resolveSteamCmdPath(installDir: string): string {
  return path.join(installDir, steamCmdEntryName());
}

export function steamCmdBootstrapRelativePath(): string {
  return path.join("public", "steambootstrapper_english.txt");
}

export interface ServicePlatformInfo {
  os: NodeJS.Platform;
  serverExecutable: string;
  serverDirExample: string;
  steamCmdBinary: string;
}

export function getServicePlatformInfo(): ServicePlatformInfo {
  return {
    os: process.platform,
    serverExecutable: defaultServerExecutable(),
    serverDirExample: defaultServerDir(),
    steamCmdBinary: steamCmdEntryName(),
  };
}
