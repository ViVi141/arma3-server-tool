import * as fs from "node:fs";
import * as path from "node:path";
import type { ModMeta } from "../types/mods.js";
import type { BikeyInspectMode } from "./bikey-service.js";

export interface ModScanCacheEntry {
  mods: ModMeta[];
  scanPathCount: number;
  bikeySummary: {
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
  };
  fingerprint: string;
  cachedAt: number;
}

const DEFAULT_TTL_MS = 45_000;

interface CacheSlot {
  entry: ModScanCacheEntry;
}

/** 按 server + bikeyMode 分槽，避免 shallow/full 互相覆盖。 */
const cacheByKey = new Map<string, CacheSlot>();

function cacheKey(serverUuid: string, bikeyMode: BikeyInspectMode): string {
  return `${serverUuid}::${bikeyMode}`;
}

function stampScanPath(raw: string): string {
  try {
    const st = fs.statSync(raw);
    let stamp = `d:${st.mtimeMs}`;
    // 模组目录内改 keys/addons 时根 mtime 不一定变；纳入子目录 mtime 避免陈旧缓存。
    for (const name of ["addons", "Addons", "keys", "Keys"]) {
      try {
        stamp += `|${name}:${fs.statSync(path.join(raw, name)).mtimeMs}`;
      } catch {
        // absent
      }
    }
    return stamp;
  } catch {
    return "missing";
  }
}

/** 服务器 Keys 覆盖写文件时目录 mtime 可能不变，改为汇总各 .bikey 文件 mtime。 */
function stampServerKeysDir(keysDir: string): string {
  try {
    if (!fs.existsSync(keysDir)) return "missing";
    const names = fs
      .readdirSync(keysDir)
      .filter((name) => /\.bikey$/i.test(name))
      .sort((a, b) => a.localeCompare(b));
    if (!names.length) {
      return `empty:${fs.statSync(keysDir).mtimeMs}`;
    }
    return names
      .map((name) => {
        try {
          return `${name}:${fs.statSync(path.join(keysDir, name)).mtimeMs}`;
        } catch {
          return `${name}:err`;
        }
      })
      .join(",");
  } catch {
    return "missing";
  }
}

/** 扫描根/模组路径指纹，路径变更或 addons/keys/服务器 Keys 变动即失效。 */
export function buildModScanFingerprint(
  modPaths: string[],
  bikeyMode: BikeyInspectMode,
  skipSize: boolean,
  serverDir?: string
): string {
  const parts: string[] = [`mode=${bikeyMode}`, `skipSize=${skipSize ? 1 : 0}`];
  for (const raw of [...modPaths].sort((a, b) => a.localeCompare(b))) {
    parts.push(`${raw.toLowerCase()}@${stampScanPath(raw)}`);
  }
  if (serverDir?.trim()) {
    parts.push(`serverKeys@${stampServerKeysDir(path.join(serverDir, "Keys"))}`);
  }
  return parts.join("|");
}

export function getCachedModScan(
  serverUuid: string,
  fingerprint: string,
  bikeyMode: BikeyInspectMode,
  now = Date.now(),
  ttlMs = DEFAULT_TTL_MS
): ModScanCacheEntry | null {
  const slot = cacheByKey.get(cacheKey(serverUuid, bikeyMode));
  if (!slot) return null;
  if (slot.entry.fingerprint !== fingerprint) return null;
  if (now - slot.entry.cachedAt > ttlMs) return null;
  return slot.entry;
}

export function setCachedModScan(
  serverUuid: string,
  bikeyMode: BikeyInspectMode,
  entry: ModScanCacheEntry
): void {
  cacheByKey.set(cacheKey(serverUuid, bikeyMode), { entry });
}

export function invalidateModScanCache(serverUuid?: string): void {
  if (!serverUuid) {
    cacheByKey.clear();
    return;
  }
  for (const key of [...cacheByKey.keys()]) {
    if (key.startsWith(`${serverUuid}::`)) {
      cacheByKey.delete(key);
    }
  }
}

/** 测试用：清空全部缓存。 */
export function clearModScanCacheForTests(): void {
  cacheByKey.clear();
}
