import * as fs from "node:fs";
import * as path from "node:path";
import type { LocalModEntry, ModBikeyStatus, ModMeta } from "../types/mods.js";
import type { ModScanPathEntry } from "./scan-path-store.js";
import { expandScanTargets, isModDirectory } from "./paths.js";

export interface ModScannerOptions {
  modPaths: string[];
  scanPathEntries?: ModScanPathEntry[];
  enabledIds: number[];
  serverModIds: number[];
  clientModIds?: number[];
  hcModIds?: number[];
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
      if (!local.path || !fs.existsSync(local.path)) {
        continue;
      }
      const meta = this.buildModMeta(local.path, options, seenPaths, localByPath, enabledLocal, local);
      if (meta) {
        meta.scanOrder = results.length;
        results.push(meta);
      }
    }

    return results;
  }

  copyBikeys(modPaths: string[], serverKeysDir: string): { copied: number; total: number; skipped: number } {
    let total = 0;
    let copied = 0;
    let skipped = 0;

    if (!fs.existsSync(serverKeysDir)) {
      fs.mkdirSync(serverKeysDir, { recursive: true });
    }

    for (const modPath of modPaths) {
      const keysDir = this.findKeysDir(modPath);
      if (!keysDir) {
        continue;
      }

      for (const file of fs.readdirSync(keysDir)) {
        if (!file.toLowerCase().endsWith(".bikey")) {
          continue;
        }
        total++;
        const src = path.join(keysDir, file);
        const dst = path.join(serverKeysDir, file);

        if (fs.existsSync(dst)) {
          skipped++;
          continue;
        }

        fs.copyFileSync(src, dst);
        copied++;
      }
    }

    return { copied, total, skipped };
  }

  summarizeBikeys(options: ModScannerOptions): {
    enabled: number;
    missingBikey: number;
    ready: number;
    needsAttention: number;
    unsigned: number;
    unchecked: number;
  } {
    const mods = this.scan(options);
    const activeMods = mods.filter((m) => m.enabled);
    let ready = 0;
    let needsAttention = 0;
    let unsigned = 0;
    let unchecked = 0;

    for (const mod of activeMods) {
      const status = mod.bikeyStatus;
      if (status === "ready") {
        ready++;
      } else if (status === "not_copied" || status === "no_key") {
        needsAttention++;
      } else if (status === "unsigned") {
        unsigned++;
      } else {
        unchecked++;
      }
    }

    return {
      enabled: activeMods.length,
      missingBikey: needsAttention,
      ready,
      needsAttention,
      unsigned,
      unchecked,
    };
  }

  copyMissingBikeys(
    mods: ModMeta[],
    serverKeysDir: string
  ): { copied: number; total: number; skipped: number } {
    const paths: string[] = [];
    for (const mod of mods) {
      if (!mod.enabled) {
        continue;
      }
      if (mod.bikeyStatus === "not_copied" && mod.path) {
        paths.push(mod.path);
      }
    }
    return this.copyBikeys(paths, serverKeysDir);
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
    const isServerMod = isLocalMod
      ? localEntry?.isServerMod ?? true
      : options.serverModIds.includes(parsed.workshopId);
    const isClientMod = isLocalMod
      ? localEntry?.isClientMod ?? true
      : (options.clientModIds ?? []).includes(parsed.workshopId);
    const isHcMod = isLocalMod
      ? localEntry?.isHcMod ?? false
      : (options.hcModIds ?? []).includes(parsed.workshopId);
    const enabled = isClientMod || isServerMod || isHcMod;

    const bikeyInspection = this.inspectBikey(modPath, options.serverDir);
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
      bikeyPresent: bikeyInspection.hasBikeyInMod,
      bikeyStatus: bikeyInspection.status,
      bikeyLabel: bikeyInspection.label,
      scanOrder: 0,
      sizeBytes: this.calculateSize(modPath),
      updatedAt: updated.updatedAt,
      updatedTime: updated.updatedTime,
    };
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

  private findKeysDir(modPath: string): string | null {
    for (const name of ["keys", "Keys"]) {
      const dir = path.join(modPath, name);
      if (fs.existsSync(dir)) {
        return dir;
      }
    }
    return null;
  }

  private listModBikeys(modPath: string): string[] {
    const keysDir = this.findKeysDir(modPath);
    if (!keysDir) {
      return [];
    }
    const names: string[] = [];
    for (const file of fs.readdirSync(keysDir)) {
      if (file.toLowerCase().endsWith(".bikey")) {
        names.push(file);
      }
    }
    return names;
  }

  private checkBikey(modPath: string): boolean {
    return this.listModBikeys(modPath).length > 0;
  }

  private hasBisignFiles(modPath: string): boolean {
    try {
      for (const file of fs.readdirSync(modPath)) {
        if (file.toLowerCase().endsWith(".bisign")) {
          return true;
        }
      }
      const addonsDir = path.join(modPath, "addons");
      if (fs.existsSync(addonsDir)) {
        for (const file of fs.readdirSync(addonsDir)) {
          if (file.toLowerCase().endsWith(".bisign")) {
            return true;
          }
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  private areBikeysOnServer(serverDir: string, bikeyNames: string[]): boolean {
    if (!bikeyNames.length) {
      return false;
    }
    const keysDir = path.join(serverDir, "keys");
    if (!fs.existsSync(keysDir)) {
      return false;
    }
    const onDisk = new Set(
      fs.readdirSync(keysDir).map((name) => name.toLowerCase())
    );
    for (const name of bikeyNames) {
      if (!onDisk.has(name.toLowerCase())) {
        return false;
      }
    }
    return true;
  }

  private inspectBikey(
    modPath: string,
    serverDir?: string
  ): { status: ModBikeyStatus; label: string; hasBikeyInMod: boolean } {
    if (!this.hasBisignFiles(modPath)) {
      return {
        status: "unsigned",
        label: "未签名",
        hasBikeyInMod: false,
      };
    }

    const bikeyNames = this.listModBikeys(modPath);
    if (!bikeyNames.length) {
      return {
        status: "no_key",
        label: "无密钥",
        hasBikeyInMod: false,
      };
    }

    const serverPath = serverDir?.trim();
    if (!serverPath) {
      return {
        status: "not_copied",
        label: "未复制",
        hasBikeyInMod: true,
      };
    }

    if (this.areBikeysOnServer(serverPath, bikeyNames)) {
      return {
        status: "ready",
        label: "已复制",
        hasBikeyInMod: true,
      };
    }

    return {
      status: "not_copied",
      label: "未复制",
      hasBikeyInMod: true,
    };
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
