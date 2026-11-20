import * as fs from "node:fs";
import * as path from "node:path";
import type { ServerConfigPackage } from "../types/config.js";
import { validateHealthConfig } from "../health/configuration.js";
import { validateMaintenancePolicy } from "../maintenance/policy.js";
import { maintenanceLocks } from "../maintenance/locks.js";
import {
  assertSafeId,
  assertSafeSubdirPath,
  assertSafeTargetPath,
} from "../util/upload-safety.js";

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
  health: "health",
  maintenance: "maintenance",
};

export interface ServerManifest {
  uuid: string;
  configName: string;
  lastModified: string;
  formatVersion: number;
}

function sectionFileStem(key: keyof ServerConfigPackage): string {
  return key === "missionParams" ? "missionparams" : String(key);
}

/** 原子写：先写临时文件再 rename，避免断电/崩溃留下半截 JSON。 */
function writeJsonAtomic(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
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
    if (uuid !== undefined) {
      assertSafeId(uuid, "服务器 UUID");
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
    const pkgDir = assertSafeSubdirPath(
      path.join(this.baseDir, CONFIG_DIR),
      uuid,
      "服务器 UUID"
    );

    if (!options?.forceDisk && this.cache.has(uuid)) {
      return structuredClone(this.cache.get(uuid)!);
    }

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
    const pkgDir = assertSafeSubdirPath(
      path.join(this.baseDir, CONFIG_DIR),
      uuid,
      "服务器 UUID"
    );
    const manifestPath = path.join(pkgDir, MANIFEST_FILE);
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

  /** Resolve the display name that should be persisted into the manifest. */
  private resolveConfigName(
    uuid: string,
    config: ServerConfigPackage,
    configName?: string
  ): string {
    if (configName && configName.trim()) {
      return configName.trim();
    }
    if (config.server?.configName && config.server.configName.trim()) {
      return config.server.configName.trim();
    }
    return this.readManifestConfigName(uuid) ?? uuid;
  }

  private writeManifest(
    pkgDir: string,
    uuid: string,
    config: ServerConfigPackage,
    configName: string
  ): void {
    writeJsonAtomic(path.join(pkgDir, MANIFEST_FILE), {
      uuid,
      configName,
      formatVersion: config.formatVersion,
      lastModified: new Date().toISOString(),
    });
  }

  /** Save a complete config package */
  save(uuid: string, config: ServerConfigPackage, configName?: string): void {
    maintenanceLocks.assertAvailable({ instances: [uuid] });
    validateHealthConfig(config);
    // 整包替换省略策略时显式落盘关闭，避免旧 maintenance.json 在重载后复活授权。
    config = { ...config, maintenance: validateMaintenancePolicy(config.maintenance) };
    const pkgDir = assertSafeSubdirPath(
      path.join(this.baseDir, CONFIG_DIR),
      uuid,
      "服务器 UUID"
    );
    fs.mkdirSync(pkgDir, { recursive: true });

    const resolvedName = this.resolveConfigName(uuid, config, configName);

    const sections: Record<string, unknown> = {};
    for (const [, key] of Object.entries(SECTION_MAP)) {
      const value = config[key];
      if (value !== undefined) {
        sections[sectionFileStem(key)] = value;
      }
    }

    // 两阶段写入：先把所有 section 写到临时文件，再统一 rename。
    // 任一临时写失败都不会破坏磁盘上的旧配置。
    const pending: { tmpPath: string; filePath: string }[] = [];
    try {
      for (const [name, data] of Object.entries(sections)) {
        const filePath = assertSafeTargetPath(pkgDir, `${name}.json`);
        const tmpPath = `${filePath}.${process.pid}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
        pending.push({ tmpPath, filePath });
      }
    } catch (err) {
      for (const item of pending) {
        try {
          fs.rmSync(item.tmpPath, { force: true });
        } catch {
          // ignore cleanup failure
        }
      }
      throw err;
    }
    for (const item of pending) {
      fs.renameSync(item.tmpPath, item.filePath);
    }
    this.writeManifest(pkgDir, uuid, config, resolvedName);

    this.cache.set(uuid, structuredClone(config));
  }

  /**
   * 只更新单个 section（如 tasks.processById），避免整包重写：
   * 1. 其他 section 文件保持原样，不会因部分写入失败而互相不一致；
   * 2. 运行期频繁改 PID 时减少磁盘写入。
   */
  patchSection(
    uuid: string,
    key: keyof ServerConfigPackage,
    patch: Record<string, unknown>
  ): ServerConfigPackage | null {
    maintenanceLocks.assertAvailable({ instances: [uuid] });
    const existing = this.load(uuid);
    if (!existing) {
      return null;
    }
    const pkgDir = assertSafeSubdirPath(
      path.join(this.baseDir, CONFIG_DIR),
      uuid,
      "服务器 UUID"
    );
    const prev = existing[key] as unknown;
    let next: unknown;
    if (
      prev !== null &&
      typeof prev === "object" &&
      !Array.isArray(prev) &&
      patch !== null &&
      typeof patch === "object" &&
      !Array.isArray(patch)
    ) {
      next = { ...(prev as Record<string, unknown>), ...patch };
    } else {
      next = patch;
    }
    if (key === "maintenance") next = validateMaintenancePolicy(next);
    const updated = { ...existing, [key]: next } as ServerConfigPackage;
    if (key === "health") validateHealthConfig(updated);

    const filePath = assertSafeTargetPath(pkgDir, `${sectionFileStem(key)}.json`);
    writeJsonAtomic(filePath, next);
    this.writeManifest(pkgDir, uuid, updated, this.resolveConfigName(uuid, updated));

    this.cache.set(uuid, structuredClone(updated));
    return updated;
  }

  /** Delete a config package */
  delete(uuid: string): boolean {
    maintenanceLocks.assertAvailable({ instances: [uuid] });
    const pkgDir = assertSafeSubdirPath(
      path.join(this.baseDir, CONFIG_DIR),
      uuid,
      "服务器 UUID"
    );
    if (!fs.existsSync(pkgDir)) return false;
    fs.rmSync(pkgDir, { recursive: true, force: true });
    this.cache.delete(uuid);
    return true;
  }

  getConfigDir(): string {
    return path.join(this.baseDir, CONFIG_DIR);
  }

  getServerConfigDir(uuid: string): string {
    return assertSafeSubdirPath(
      path.join(this.baseDir, CONFIG_DIR),
      uuid,
      "服务器 UUID"
    );
  }
}
