import * as fs from "node:fs";
import * as path from "node:path";
import type { LocalModEntry, ModMeta } from "../types/mods.js";
import type { ModRoleEntry } from "../types/config.js";
import type { ModScanPathEntry } from "./scan-path-store.js";
import { expandScanTargets, isModDirectory } from "./paths.js";
import { resolveConfiguredPath } from "../util/user-path.js";
import { visiblePathKey } from "../util/path-identity.js";
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
  skipSize?: boolean;
}

export class ModScanner {
  scan(options: ModScannerOptions): ModMeta[] {
    const results: ModMeta[] = [];
    const seenPaths = new Set<string>();
    const enabledLocal = new Set((options.enabledLocalPaths ?? []).map(visiblePathKey));
    const localByPath = new Map<string, LocalModEntry>();
    for (const entry of options.localMods ?? []) {
      if (entry.path) localByPath.set(visiblePathKey(entry.path), entry);
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
      if (!localPath) {
        continue;
      }
      const meta = this.buildModMeta(localPath, options, seenPaths, localByPath, enabledLocal, local);
      if (meta) {
        meta.scanOrder = results.length;
        results.push(meta);
      }
    }

    // 已配置角色的路径即使丢失或读取失败，也必须留在待检查清单中。
    for (const role of options.roleEntries ?? []) {
      if (!role.path) continue;
      const meta = this.buildModMeta(resolveConfiguredPath(role.path), options, seenPaths, localByPath, enabledLocal);
      if (meta) { meta.scanOrder = results.length; results.push(meta); }
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

  summarizeBikeys(options: ModScannerOptions, scanned?: ModMeta[]): {
    enabled: number;
    missingBikey: number;
    ready: number;
    notCopied: number;
    noKey: number;
    needsAttention: number;
    unsigned: number;
    partial: number;
    keyMismatch: number;
    readError: number;
    unchecked: number;
    allValid: boolean;
  } {
    const mods = scanned ?? this.scan({ ...options, skipSize: true });
    const activeMods = mods.filter((m) => m.enabled);
    let ready = 0;
    let notCopied = 0;
    let noKey = 0;
    let unsigned = 0;
    let partial = 0;
    let keyMismatch = 0;
    let readError = 0;
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
      } else if (status === "partial") {
        partial++;
      } else if (status === "key_mismatch") {
        keyMismatch++;
      } else if (status === "read_error") {
        readError++;
      } else {
        unchecked++;
      }
    }

    const needsAttention = activeMods.length - ready;
    const allValid = activeMods.length > 0 && ready === activeMods.length;

    return {
      enabled: activeMods.length,
      missingBikey: needsAttention,
      ready,
      notCopied,
      noKey,
      needsAttention,
      unsigned,
      partial,
      keyMismatch,
      readError,
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
      if (inspection.evidence?.canDeployKeys) {
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
    const identity = visiblePathKey(modPath);
    if (seenPaths.has(identity)) return null;
    const localEntry = explicitLocal ?? localByPath.get(identity);
    const pathRole = this.findSavedRole(options.roleEntries ?? [], modPath, 0);
    if (!localEntry && !pathRole && !isModDirectory(modPath)) return null;
    seenPaths.add(identity);

    const dirName = path.basename(modPath);
    const parsed = this.readModMeta(modPath, dirName);
    if (!parsed.workshopId && pathRole) parsed.workshopId = pathRole.workshopId;
    const isLocalMod = !!localEntry;
    const inputLocalMod = isLocalMod;
    const savedRole = pathRole ?? this.findSavedRole(options.roleEntries ?? [], modPath, parsed.workshopId);
    const hasPathRole = (options.roleEntries ?? []).some((entry) => entry.path && entry.workshopId === parsed.workshopId);
    const localEnabled = localEntry?.enabled ?? enabledLocal.has(identity);
    let isServerMod = isLocalMod
      ? localEntry?.isServerMod ?? localEnabled
      : !hasPathRole && options.serverModIds.includes(parsed.workshopId);
    let isClientMod = isLocalMod
      ? localEntry?.isClientMod ?? localEnabled
      : !hasPathRole && (options.clientModIds ?? []).includes(parsed.workshopId);
    let isHcMod = isLocalMod
      ? localEntry?.isHcMod ?? false
      : !hasPathRole && (options.hcModIds ?? []).includes(parsed.workshopId);
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
      signatureEvidence: bikeyInspection.evidence,
      sizeBytes: options.skipSize ? undefined : this.calculateSize(modPath),
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
    const pathKey = visiblePathKey(modPath);
    for (const entry of roleEntries) {
      if (entry.path && visiblePathKey(entry.path) === pathKey) {
        return entry;
      }
    }
    if (workshopId > 0) {
      for (const entry of roleEntries) {
        if (!entry.path && entry.workshopId === workshopId) {
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
    // meta.cpp `timestamp` is Unix SECONDS. Interpreting it as milliseconds
    // (new Date(seconds)) collapsed every mod to ~1970, so it always compared
    // older than the Workshop time_updated and reported "有更新" forever.
    if (timeStamp > 0) {
      try {
        const date = new Date(timeStamp * 1000);
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
