import * as fs from "node:fs";
import * as path from "node:path";
import { resolveConfiguredPath } from "../util/user-path.js";

export interface SteamCmdSettings {
  username: string;
  password: string;
  workshopRoot: string;
  serverInstallPath: string;
}

const DEFAULTS: SteamCmdSettings = {
  username: "",
  password: "",
  workshopRoot: "",
  serverInstallPath: "",
};

const WORKSHOP_CONTENT_REL = path.join("steamapps", "workshop", "content", "107410");

export class SteamCmdSettingsStore {
  private filePath: string;

  constructor(dataDir: string) {
    const dir = path.join(dataDir, "config");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, "steamcmd-settings.json");
  }

  load(): SteamCmdSettings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as Partial<SteamCmdSettings>;
      return {
        username: raw.username ?? DEFAULTS.username,
        password: raw.password ?? DEFAULTS.password,
        workshopRoot: raw.workshopRoot ?? DEFAULTS.workshopRoot,
        serverInstallPath: raw.serverInstallPath ?? DEFAULTS.serverInstallPath,
      };
    } catch {
      return { ...DEFAULTS };
    }
  }

  save(settings: SteamCmdSettings): void {
    fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2), "utf-8");
    ensureWorkshopContentDirectory(settings.workshopRoot);
  }

  merge(partial: Partial<SteamCmdSettings>): SteamCmdSettings {
    const current = this.load();
    const merged: SteamCmdSettings = {
      username: partial.username ?? current.username,
      password: partial.password !== undefined ? partial.password : current.password,
      workshopRoot: partial.workshopRoot ?? current.workshopRoot,
      serverInstallPath: partial.serverInstallPath ?? current.serverInstallPath,
    };
    this.save(merged);
    return merged;
  }
}

export function ensureWorkshopContentDirectory(workshopRoot: string): void {
  const resolvedRoot = resolveConfiguredPath(workshopRoot);
  if (!resolvedRoot) {
    return;
  }
  try {
    fs.mkdirSync(path.join(resolvedRoot, WORKSHOP_CONTENT_REL), { recursive: true });
  } catch {
    // best effort
  }
}

export function countWorkshopMods(workshopRoot: string): number {
  const resolvedRoot = resolveConfiguredPath(workshopRoot);
  if (!resolvedRoot) {
    return 0;
  }
  const contentDir = path.join(resolvedRoot, WORKSHOP_CONTENT_REL);
  if (!fs.existsSync(contentDir)) {
    return 0;
  }
  return fs.readdirSync(contentDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

export interface SteamCmdSettingsView {
  username: string;
  hasPassword: boolean;
  workshopRoot: string;
  serverInstallPath: string;
  steamCmdDir: string;
  workshopModCount: number;
}

export function toSteamCmdSettingsView(
  settings: SteamCmdSettings,
  steamCmdDir: string
): SteamCmdSettingsView {
  return {
    username: settings.username,
    hasPassword: settings.password.length > 0,
    workshopRoot: settings.workshopRoot,
    serverInstallPath: settings.serverInstallPath,
    steamCmdDir,
    workshopModCount: countWorkshopMods(settings.workshopRoot),
  };
}
