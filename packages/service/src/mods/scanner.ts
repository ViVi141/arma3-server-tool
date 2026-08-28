import * as fs from "node:fs";
import * as path from "node:path";
import type { LocalModEntry, ModMeta } from "../types/mods.js";
import type { ModRoleEntry } from "../types/config.js";
import type { ModScanPathEntry } from "./scan-path-store.js";
import { expandScanTargets, isModDirectory } from "./paths.js";
import { resolveConfiguredPath } from "../util/user-path.js";
import {
  copyBikeysForMods,
  inspectMod,
  isModBikeyValidationPassed,
  type BikeyCopyResult,
} from "./bikey-service.js";

export interface ModScannerOptions {
  modPaths: string[];
  scanPathEntries?: ModScanPathEntry[];
  enabledIds: number[];
  serverModIds: number[];
  clientModIds?: number[];
  hcModIds?: number[];
  roleEntries?: ModRoleEntry[];
  localMods?: LocalModEntry[];
  enabledLocalPaths?: string[];
  serverDir?: string;
}

export class ModScanner {
  scan(options: ModScannerOptions): ModMeta[] {
    const results: ModMeta[] = [];
    const seenPaths = new Set<string>();
    const enabledLocal = new Set(
      (options.enabledLocalPaths ?? []).map((p) => p.toLowerCase())
    );
    const localByPath = new Map<string, LocalModEntry>();
    for (const entry of options.localMods ?? []) {
      if (entry.path) {
        localByPath.set(entry.path.toLowerCase(), entry);
      }
    }

    const targets = expandScanTargets(options.modPaths, options.scanPathEntries ?? []);
    for (const target of targets) {
      const meta = this.buildModMeta(target.modPath, options, seenPaths, localByPath, enabledLocal);
      if (meta) {
        meta.scanOrder = results.length;
        results.push(meta);
      }
    }

    for (const local of options.localMods ?? []) {
      const localPath = local.path ? resolveConfiguredPath(local.path) : "";
      if (!localPath || !fs.existsSync(localPath)) {
        continue;
      }
      const meta = this.buildModMeta(localPath, options, seenPaths, localByPath, enabledLocal, local);
      if (meta) {
        meta.scanOrder = results.length;
        results.push(meta);
      }
    }

    return results;
  }

  copyBikeys(modPaths: string[], serverDir: string): BikeyCopyResult {
    const mods = modPaths.map((modPath) => ({
      modPath,
      modDirName: path.basename(modPath),
    }));
    return copyBikeysForMods(mods, serverDir);
  }

  /** Copy bikeys for every scanned mod (C# CopyBikeysForAllMods on allRows). */
  copyBikeysFromScanned(mods: ModMeta[], serverDir: string): BikeyCopyResult {
    const toCopy: { modPath: string; modDirName: string }[] = [];
    for (const mod of mods) {
      if (!mod.path) {
        continue;
      }
      toCopy.push({ modPath: mod.path, modDirName: mod.dirName });
    }
    return copyBikeysForMods(toCopy, serverDir);
  }

  summarizeBikeys(options: ModScannerOptions): {
    enabled: number;
    missingBikey: number;
    ready: number;
    notCopied: number;
    noKey: number;
    needsAttention: number;
    unsigned: number;
    unchecked: number;
    allValid: boolean;
  } {
    const mods = this.scan(options);
    const activeMods = mods.filter((m) => m.enabled);
    let ready = 0;
    let notCopied = 0;
    let noKey = 0;
    let unsigned = 0;
    let unchecked = 0;

    for (const mod of activeMods) {
      const status = mod.bikeyStatus;
      if (status === "ready") {
        ready++;
      } else if (status === "not_copied") {
        notCopied++;
      } else if (status === "no_key") {
        noKey++;
      } else if (status === "unsigned") {
        unsigned++;
      } else {
        unchecked++;
      }
    }

    const needsAttention = notCopied + noKey + unsigned + unchecked;
    const allValid = activeMods.length > 0 && ready === activeMods.length;

    return {
      enabled: activeMods.length,
      missingBikey: needsAttention,
      ready,
      notCopied,
      noKey,
      needsAttention,
      unsigned,
      unchecked,
      allValid,
    };
  }

  copyMissingBikeys(mods: ModMeta[], serverDir: string): BikeyCopyResult {
    const toCopy: { modPath: string; modDirName: string }[] = [];
    for (const mod of mods) {
      if (!mod.enabled || !mod.path) {
        continue;
      }
      const inspection = inspectMod(mod.path, mod.dirName, serverDir);
      if (inspection.hasBisign && inspection.hasBikeyInMod && !inspection.allCopiedToServer) {
        toCopy.push({ modPath: mod.path, modDirName: mod.dirName });
      }
    }
    return copyBikeysForMods(toCopy, serverDir);
  }

  private buildModMeta(
    modPath: string,
    options: ModScannerOptions,
    seenPaths: Set<string>,
    localByPath: Map<string, LocalModEntry>,
    enabledLocal: Set<string>,
    explicitLocal?: LocalModEntry
  ): ModMeta | null {
    if (!fs.existsSync(modPath)) {
      return null;
    }

    let realPath = modPath;
    try {
      realPath = fs.realpathSync(modPath);
    } catch {
      return null;
    }
    if (seenPaths.has(realPath)) {
      return null;
    }
    seenPaths.add(realPath);

    const localEntry = explicitLocal ?? localByPath.get(modPath.toLowerCase());
    if (!localEntry && !isModDirectory(modPath)) {
      return null;
    }

    const dirName = path.basename(modPath);
    const parsed = this.readModMeta(modPath, dirName);
    const isLocalMod = !!localEntry;
    const inputLocalMod = isLocalMod;
    const savedRole = this.findSavedRole(options.roleEntries ?? [], modPath, parsed.workshopId);
    let isServerMod = isLocalMod
      ? localEntry?.isServerMod ?? true
      : options.serverModIds.includes(parsed.workshopId);
    let isClientMod = isLocalMod
      ? localEntry?.isClientMod ?? true
      : (options.clientModIds ?? []).includes(parsed.workshopId);
    let isHcMod = isLocalMod
      ? localEntry?.isHcMod ?? false
      : (options.hcModIds ?? []).includes(parsed.workshopId);
    if (savedRole) {
      isServerMod = savedRole.isServerMod;
      isClientMod = savedRole.isClientMod;
      isHcMod = savedRole.isHcMod;
    }
    const enabled = isClientMod || isServerMod || isHcMod;

    const bikeyInspection = inspectMod(modPath, dirName, options.serverDir);
    const updated = this.readUpdatedTime(modPath, parsed.timeStamp);

    return {
      workshopId: parsed.workshopId,
      name: localEntry?.name ?? parsed.name,
      dirName,
      path: modPath,
      enabled,
      isServerMod,
      isClientMod,
      isHcMod,
      isLocalMod,
      inputLocalMod,
      bikeyPresent: isModBikeyValidationPassed(bikeyInspection.status),
      bikeyStatus: bikeyInspection.status,
      bikeyLabel: bikeyInspection.label,
      sizeBytes: this.calculateSize(modPath),
      updatedAt: updated.updatedAt,
      updatedTime: updated.updatedTime,
      scanOrder: 0,
    };
  }

  private findSavedRole(
    roleEntries: ModRoleEntry[],
    modPath: string,
    workshopId: number
  ): ModRoleEntry | undefined {
    const pathKey = modPath.toLowerCase();
    for (const entry of roleEntries) {
      if (entry.path && entry.path.toLowerCase() === pathKey) {
        return entry;
      }
    }
    if (workshopId > 0) {
      for (const entry of roleEntries) {
        if (entry.workshopId === workshopId) {
          return entry;
        }
      }
    }
    return undefined;
  }

  private readUpdatedTime(
    modPath: string,
    timeStamp: number
  ): { updatedAt?: string; updatedTime: string } {
    if (timeStamp > 0) {
      try {
        const date = new Date(timeStamp);
        if (!Number.isNaN(date.getTime())) {
          return { updatedAt: date.toISOString(), updatedTime: date.toLocaleString() };
        }
      } catch {
        // fall through
      }
    }

    try {
      const stat = fs.statSync(modPath);
      const date = stat.mtime;
      return { updatedAt: date.toISOString(), updatedTime: date.toLocaleString() };
    } catch {
      return { updatedTime: "-" };
    }
  }

  private readModMeta(
    modPath: string,
    dirName: string
  ): { workshopId: number; name: string; timeStamp: number } {
    const metaFile = path.join(modPath, "meta.cpp");
    let workshopId = 0;
    let name = dirName;
    let timeStamp = 0;

    if (fs.existsSync(metaFile)) {
      try {
        const content = fs.readFileSync(metaFile, "utf-8");
        const idMatch = content.match(/publishedid\s*=\s*(\d+)/i);
        if (idMatch) {
          workshopId = parseInt(idMatch[1], 10);
        }
        const nameMatch = content.match(/name\s*=\s*"([^"]+)"/i);
        if (nameMatch) {
          name = nameMatch[1].trim();
        }
        const timeMatch = content.match(/timestamp\s*=\s*(\d+)/i);
        if (timeMatch) {
          timeStamp = parseInt(timeMatch[1], 10);
        }
      } catch {
        // ignore
      }
    }

    if (workshopId === 0 && /^\d{7,}$/.test(dirName)) {
      workshopId = parseInt(dirName, 10);
    }

    const workshopMatch = dirName.match(/^@?[^_]+_(\d{7,})$/);
    if (workshopId === 0 && workshopMatch) {
      workshopId = parseInt(workshopMatch[1], 10);
    }

    return { workshopId, name, timeStamp };
  }

  private calculateSize(dirPath: string): number {
    let total = 0;
    try {
      const entries = fs.readdirSync(dirPath, { recursive: true });
      for (const entry of entries) {
        const rel = String(entry);
        const filePath = path.join(dirPath, rel);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            total += stat.size;
          }
        } catch {
          // skip locked files
        }
      }
    } catch {
      // skip inaccessible directories
    }
    return total;
  }
}
