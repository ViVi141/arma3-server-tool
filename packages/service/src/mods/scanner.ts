import * as fs from "node:fs";
import * as path from "node:path";
import type { ModMeta } from "../types/mods.js";

export interface ModScannerOptions {
  modPaths: string[];
  enabledIds: number[];   // Workshop IDs of enabled mods
  serverModIds: number[]; // Workshop IDs of server-side-only mods
}

export class ModScanner {
  /** Scan all mod directories, return metadata */
  scan(options: ModScannerOptions): ModMeta[] {
    const results: ModMeta[] = [];
    const seenPaths = new Set<string>();

    for (const basePath of options.modPaths) {
      if (!fs.existsSync(basePath)) continue;

      for (const entry of fs.readdirSync(basePath, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;

        const fullPath = path.join(basePath, entry.name);

        // Skip if already seen (by symlink or same path)
        const realPath = fs.realpathSync(fullPath);
        if (seenPaths.has(realPath)) continue;
        seenPaths.add(realPath);

        // Try to extract Workshop ID from directory name or meta file
        const workshopId = this.extractWorkshopId(entry.name, fullPath);
        const bikeyPresent = this.checkBikey(fullPath);

        results.push({
          workshopId,
          name: entry.name,
          path: fullPath,
          enabled: options.enabledIds.includes(workshopId),
          isServerMod: options.serverModIds.includes(workshopId),
          bikeyPresent,
          sizeBytes: this.calculateSize(fullPath),
        });
      }
    }

    return results;
  }

  /** Copy bikey files from a mod's keys directory to the server keys directory */
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

  /** List enabled mods missing bikey files */
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

  /** Try to extract Workshop ID from a mod directory */
  private extractWorkshopId(dirName: string, modPath: string): number {
    // Check for meta.cpp in the mod directory
    const metaFile = path.join(modPath, "meta.cpp");
    if (fs.existsSync(metaFile)) {
      try {
        const content = fs.readFileSync(metaFile, "utf-8");
        const match = content.match(/publishedid\s*=\s*(\d+)/i);
        if (match) return parseInt(match[1], 10);
      } catch {
        // ignore
      }
    }

    // Also check for a workshop id in the directory name pattern "@xxx_1234567"
    const workshopMatch = dirName.match(/^@?[^_]+_(\d{7,})$/);
    if (workshopMatch) return parseInt(workshopMatch[1], 10);

    return 0;
  }

  /** Calculate the total size of a mod directory */
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
