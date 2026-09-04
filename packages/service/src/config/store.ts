import * as fs from "node:fs";
import * as path from "node:path";
import type { ServerConfigPackage } from "../types/config.js";

const CONFIG_DIR = "config";
const MANIFEST_FILE = "manifest.json";

/** JSON file stem → config package property */
const SECTION_MAP: Record<string, keyof ServerConfigPackage> = {
  server: "server",
  startup: "startup",
  mods: "mods",
  basic: "basic",
  profile: "profile",
  battleye: "battleye",
  tasks: "tasks",
  missionparams: "missionParams",
  scheduler: "scheduler",
  monitoring: "monitoring",
};

export interface ServerManifest {
  uuid: string;
  configName: string;
  lastModified: string;
  formatVersion: number;
}

export class ConfigStore {
  private baseDir: string;
  private cache = new Map<string, ServerConfigPackage>();

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
  }

  invalidateCache(uuid?: string): void {
    if (uuid) {
      this.cache.delete(uuid);
      return;
    }
    this.cache.clear();
  }

  /** List all saved servers (reads only manifest) */
  listServers(): ServerManifest[] {
    const results: ServerManifest[] = [];
    const configDir = path.join(this.baseDir, CONFIG_DIR);

    if (!fs.existsSync(configDir)) return results;

    for (const entry of fs.readdirSync(configDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(configDir, entry.name, MANIFEST_FILE);
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as ServerManifest;
          results.push(manifest);
        } catch {
          // skip corrupted
        }
      }
    }

    return results;
  }

  /** Load a full config package */
  load(uuid: string, options?: { forceDisk?: boolean }): ServerConfigPackage | null {
    if (!options?.forceDisk && this.cache.has(uuid)) {
      return structuredClone(this.cache.get(uuid)!);
    }

    const pkgDir = path.join(this.baseDir, CONFIG_DIR, uuid);
    if (!fs.existsSync(pkgDir)) return null;

    const pkg: ServerConfigPackage = { formatVersion: 2 };

    for (const file of fs.readdirSync(pkgDir)) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(pkgDir, file);
      try {
        const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const stem = path.basename(file, ".json").toLowerCase();
        if (stem === "manifest") {
          pkg.formatVersion = content.formatVersion ?? 2;
          continue;
        }
        const key = SECTION_MAP[stem];
        if (key) {
          (pkg as unknown as Record<string, unknown>)[key] = content;
        }
      } catch {
        // skip invalid
      }
    }

    this.cache.set(uuid, structuredClone(pkg));
    return pkg;
  }

  private readManifestConfigName(uuid: string): string | undefined {
    const manifestPath = path.join(this.baseDir, CONFIG_DIR, uuid, MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) {
      return undefined;
    }
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as ServerManifest;
      const name = manifest.configName?.trim();
      if (name) {
        return name;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** Save a complete config package */
  save(uuid: string, config: ServerConfigPackage, configName?: string): void {
    const pkgDir = path.join(this.baseDir, CONFIG_DIR, uuid);
    fs.mkdirSync(pkgDir, { recursive: true });

    let resolvedName = uuid;
    if (configName && configName.trim()) {
      resolvedName = configName.trim();
    } else if (config.server?.configName && config.server.configName.trim()) {
      resolvedName = config.server.configName.trim();
    } else {
      const existingName = this.readManifestConfigName(uuid);
      if (existingName) {
        resolvedName = existingName;
      }
    }

    const sections: Record<string, unknown> = {
      manifest: {
        uuid,
        configName: resolvedName,
        formatVersion: config.formatVersion,
        lastModified: new Date().toISOString(),
      },
    };

    for (const [, key] of Object.entries(SECTION_MAP)) {
      const value = config[key];
      if (value !== undefined) {
        const fileStem = key === "missionParams" ? "missionparams" : key;
        sections[fileStem] = value;
      }
    }

    for (const [name, data] of Object.entries(sections)) {
      const filePath = path.join(pkgDir, `${name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    }

    this.cache.set(uuid, structuredClone(config));
  }

  /** Delete a config package */
  delete(uuid: string): boolean {
    const pkgDir = path.join(this.baseDir, CONFIG_DIR, uuid);
    if (!fs.existsSync(pkgDir)) return false;
    fs.rmSync(pkgDir, { recursive: true, force: true });
    this.cache.delete(uuid);
    return true;
  }

  getConfigDir(): string {
    return path.join(this.baseDir, CONFIG_DIR);
  }

  getServerConfigDir(uuid: string): string {
    return path.join(this.baseDir, CONFIG_DIR, uuid);
  }
}
