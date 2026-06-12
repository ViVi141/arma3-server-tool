import * as fs from "node:fs";
import * as path from "node:path";
import type { LocalModEntry, ModMeta } from "../types/mods.js";
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
        results.push(meta);
      }
    }

    for (const local of options.localMods ?? []) {
      if (!local.path || !fs.existsSync(local.path)) {
        continue;
      }
      const meta = this.buildModMeta(local.path, options, seenPaths, localByPath, enabledLocal, local);
      if (meta) {
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
  } {
    const mods = this.scan(options);
    const enabledMods = mods.filter((m) => m.enabled);
    const missingBikey = enabledMods.filter((m) => !m.bikeyPresent).length;
    return {
      enabled: enabledMods.length,
      missingBikey,
      ready: enabledMods.length - missingBikey,
    };
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
    const enabled = isLocalMod
      ? enabledLocal.has(modPath.toLowerCase()) || !!localEntry?.enabled
      : options.enabledIds.includes(parsed.workshopId);

    return {
      workshopId: parsed.workshopId,
      name: localEntry?.name ?? parsed.name,
      path: modPath,
      enabled,
      isServerMod: isLocalMod
        ? localEntry?.isServerMod ?? true
        : options.serverModIds.includes(parsed.workshopId),
      isClientMod: isLocalMod
        ? localEntry?.isClientMod ?? true
        : (options.clientModIds ?? []).includes(parsed.workshopId),
      isHcMod: isLocalMod
        ? localEntry?.isHcMod ?? false
        : (options.hcModIds ?? []).includes(parsed.workshopId),
      isLocalMod,
      bikeyPresent: this.checkBikey(modPath),
      sizeBytes: this.calculateSize(modPath),
    };
  }

  private readModMeta(modPath: string, dirName: string): { workshopId: number; name: string } {
    const metaFile = path.join(modPath, "meta.cpp");
    let workshopId = 0;
    let name = dirName;

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

    return { workshopId, name };
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

  private checkBikey(modPath: string): boolean {
    const keysDir = this.findKeysDir(modPath);
    if (!keysDir) {
      return false;
    }

    return fs.readdirSync(keysDir).some((f) => f.toLowerCase().endsWith(".bikey"));
  }

  private calculateSize(dirPath: string): number {
    let total = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(dirPath, entry.name);
          try {
            total += fs.statSync(filePath).size;
          } catch {
            // skip locked files
          }
        }
      }
    } catch {
      // skip inaccessible directories
    }
    return total;
  }
}
