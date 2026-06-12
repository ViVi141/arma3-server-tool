import * as fs from "node:fs";
import * as path from "node:path";
import type { ModBikeyStatus } from "../types/mods.js";

export interface ModBikeyFile {
  fullPath: string;
  name: string;
}

export interface ModBikeyInspectionResult {
  hasBisign: boolean;
  hasBikeyInMod: boolean;
  allCopiedToServer: boolean;
  status: ModBikeyStatus;
  label: string;
}

/** Short labels for the four bikey states shown in the mod list. */
export const MOD_BIKEY_STATUS_LABELS: Record<ModBikeyStatus, string> = {
  unsigned: "未签名",
  no_key: "无密钥",
  not_copied: "未复制",
  ready: "验证通过",
};

/** Enabled mods pass validation only when bisign, key, and server copy are all present. */
export function isModBikeyValidationPassed(status: ModBikeyStatus | undefined): boolean {
  return status === "ready";
}

export function isModBikeyInspectionValid(result: ModBikeyInspectionResult): boolean {
  return result.hasBisign && result.hasBikeyInMod && result.allCopiedToServer;
}

function emptyInspection(): ModBikeyInspectionResult {
  return {
    hasBisign: false,
    hasBikeyInMod: false,
    allCopiedToServer: false,
    status: "unsigned",
    label: MOD_BIKEY_STATUS_LABELS.unsigned,
  };
}

/**
 * Resolve one of four mutually exclusive states. Only `ready` passes mod validation
 * (bisign + key in mod + copied to server Keys/ — all three required).
 */
export function resolveModBikeyStatus(
  hasBisign: boolean,
  modBikeys: ModBikeyFile[],
  modDirName: string,
  serverDir?: string,
): ModBikeyInspectionResult {
  if (!hasBisign) {
    return emptyInspection();
  }

  if (!modBikeys.length) {
    return {
      hasBisign: true,
      hasBikeyInMod: false,
      allCopiedToServer: false,
      status: "no_key",
      label: MOD_BIKEY_STATUS_LABELS.no_key,
    };
  }

  const result: ModBikeyInspectionResult = {
    hasBisign: true,
    hasBikeyInMod: true,
    allCopiedToServer: false,
    status: "not_copied",
    label: MOD_BIKEY_STATUS_LABELS.not_copied,
  };

  const trimmedServerDir = serverDir?.trim();
  if (!trimmedServerDir) {
    return result;
  }

  const keysDirectory = getServerKeysDirectory(trimmedServerDir);
  if (areAllModBikeysOnServer(keysDirectory, modDirName, modBikeys)) {
    result.allCopiedToServer = true;
    result.status = "ready";
    result.label = MOD_BIKEY_STATUS_LABELS.ready;
  }
  return result;
}

/** Same as BikeyService.GetServerKeysDirectory — Arma server uses capital Keys. */
export function getServerKeysDirectory(serverDir: string): string {
  return path.join(serverDir, "Keys");
}

/** Same as BikeyService.NormalizeBikeyToken. */
export function normalizeBikeyToken(value: string): string {
  if (!value) {
    return "";
  }
  return value.replace(/ /g, "_").replace(/@/g, "");
}

/** Same as BikeyService.GetCopiedBikeyFileName. */
export function getCopiedBikeyFileName(modDirName: string, bikey: ModBikeyFile): string {
  const safeDirName = normalizeBikeyToken(modDirName);
  let safeName = normalizeBikeyToken(bikey.name.replace(/ /g, "_"));
  safeName = safeName.replace(/bikey/gi, "");
  safeName = safeName.replace(/\./g, "");
  const ext = path.extname(bikey.name);
  return `${safeDirName}-${safeName}${ext}`;
}

/** Same as BikeyService.GetCopiedBikeyPath. */
export function getCopiedBikeyPath(
  serverKeysDirectory: string,
  modDirName: string,
  bikey: ModBikeyFile,
): string {
  return path.join(serverKeysDirectory, getCopiedBikeyFileName(modDirName, bikey));
}

function pathIdentity(dirPath: string): string {
  const resolved = path.resolve(dirPath);
  if (process.platform === "win32") {
    return resolved.toLowerCase();
  }
  return resolved;
}

/** Arma mods ship server bikeys under keys/ or Keys/. */
export function resolveModKeysDirectories(modPath: string): string[] {
  const result: string[] = [];
  const seenPaths = new Set<string>();

  for (const folderName of ["keys", "Keys"]) {
    const keysDir = path.join(modPath, folderName);
    if (!fs.existsSync(keysDir)) {
      continue;
    }
    try {
      const stat = fs.statSync(keysDir);
      if (!stat.isDirectory()) {
        continue;
      }
      const identity = pathIdentity(keysDir);
      if (seenPaths.has(identity)) {
        continue;
      }
      seenPaths.add(identity);
      result.push(keysDir);
    } catch {
      /* ignore */
    }
  }
  return result;
}

/** Same as BikeyService.FindModBikeys — recurse the entire mod directory. */
export function findModBikeys(modPath: string): ModBikeyFile[] {
  const result: ModBikeyFile[] = [];
  collectBikeys(modPath, result);
  return result;
}

function collectBikeys(directory: string, result: ModBikeyFile[]): void {
  if (!directory || !fs.existsSync(directory)) {
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".bikey")) {
      result.push({ fullPath, name: entry.name });
      continue;
    }

    let isChildDirectory = entry.isDirectory();
    if (!isChildDirectory && entry.isSymbolicLink()) {
      try {
        isChildDirectory = fs.statSync(fullPath).isDirectory();
      } catch {
        isChildDirectory = false;
      }
    }
    if (isChildDirectory) {
      collectBikeys(fullPath, result);
    }
  }
}

/** Detect signed content; recurse under addons/ for nested Workshop layouts. */
export function hasBisignFiles(modPath: string): boolean {
  if (!modPath || !fs.existsSync(modPath)) {
    return false;
  }

  if (directoryHasBisign(modPath, false)) {
    return true;
  }

  const addonsPath = path.join(modPath, "addons");
  if (fs.existsSync(addonsPath)) {
    return directoryHasBisign(addonsPath, true);
  }

  return false;
}

function directoryHasBisign(directory: string, recursive: boolean): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".bisign")) {
      return true;
    }

    if (!recursive) {
      continue;
    }

    let isChildDirectory = entry.isDirectory();
    if (!isChildDirectory && entry.isSymbolicLink()) {
      try {
        isChildDirectory = fs.statSync(fullPath).isDirectory();
      } catch {
        isChildDirectory = false;
      }
    }
    if (isChildDirectory && directoryHasBisign(fullPath, true)) {
      return true;
    }
  }

  return false;
}

/** Same as BikeyService.IsBikeyPresentOnServer. */
export function isBikeyPresentOnServer(
  serverKeysDirectory: string,
  modDirName: string,
  bikey: ModBikeyFile,
): boolean {
  const copiedPath = getCopiedBikeyPath(serverKeysDirectory, modDirName, bikey);
  if (fs.existsSync(copiedPath)) {
    return true;
  }
  const originalPath = path.join(serverKeysDirectory, bikey.name);
  return fs.existsSync(originalPath);
}

/** Same as BikeyService.AreAllModBikeysOnServer. */
export function areAllModBikeysOnServer(
  serverKeysDirectory: string,
  modDirName: string,
  modBikeys: ModBikeyFile[],
): boolean {
  if (!modBikeys.length) {
    return false;
  }
  if (!fs.existsSync(serverKeysDirectory)) {
    return false;
  }

  for (const bikey of modBikeys) {
    if (!isBikeyPresentOnServer(serverKeysDirectory, modDirName, bikey)) {
      return false;
    }
  }
  return true;
}

/** Same as BikeyService.InspectMod. */
export function inspectMod(
  modPath: string,
  modDirName: string,
  serverDir?: string,
): ModBikeyInspectionResult {
  if (!modPath || !fs.existsSync(modPath)) {
    return emptyInspection();
  }

  try {
    const hasBisign = hasBisignFiles(modPath);
    const modBikeys = hasBisign ? findModBikeys(modPath) : [];
    return resolveModBikeyStatus(hasBisign, modBikeys, modDirName, serverDir);
  } catch {
    return emptyInspection();
  }
}

export interface BikeyCopyResult {
  copied: number;
  total: number;
  skipped: number;
}

/** Copy bikeys for one mod — same as BikeyService.CopyBikeysForMod (always overwrite). */
export function copyBikeysForMod(
  modPath: string,
  modDirName: string,
  serverDir: string,
): BikeyCopyResult {
  const result: BikeyCopyResult = { copied: 0, total: 0, skipped: 0 };
  if (!modPath || !fs.existsSync(modPath)) {
    return result;
  }

  const bikeys = findModBikeys(modPath);
  if (!bikeys.length) {
    return result;
  }

  const keysDirectory = getServerKeysDirectory(serverDir);
  fs.mkdirSync(keysDirectory, { recursive: true });

  for (const bikey of bikeys) {
    result.total++;
    const targetPath = getCopiedBikeyPath(keysDirectory, modDirName, bikey);
    const already = isBikeyPresentOnServer(keysDirectory, modDirName, bikey);
    if (already) {
      result.skipped++;
    }
    try {
      fs.copyFileSync(bikey.fullPath, targetPath);
      if (!already) {
        result.copied++;
      }
    } catch {
      // best effort per key file
    }
  }

  return result;
}

export function copyBikeysForMods(
  mods: { modPath: string; modDirName: string }[],
  serverDir: string,
): BikeyCopyResult {
  const combined: BikeyCopyResult = { copied: 0, total: 0, skipped: 0 };
  for (const mod of mods) {
    const one = copyBikeysForMod(mod.modPath, mod.modDirName, serverDir);
    combined.copied += one.copied;
    combined.total += one.total;
    combined.skipped += one.skipped;
  }
  return combined;
}

export function listServerBikeys(serverDir: string): string[] {
  const keysDirectory = getServerKeysDirectory(serverDir);
  if (!fs.existsSync(keysDirectory)) {
    return [];
  }

  const result: string[] = [];
  for (const file of fs.readdirSync(keysDirectory)) {
    if (file.toLowerCase().endsWith(".bikey")) {
      result.push(path.join(keysDirectory, file));
    }
  }
  return result;
}
