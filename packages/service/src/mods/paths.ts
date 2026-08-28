import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";
import { resolveModPaths } from "./enabler.js";
import type { ModScanPathEntry } from "./scan-path-store.js";
import { ensureWorkshopContentDirectory } from "../settings/steamcmd-settings.js";

const WORKSHOP_APP_ID = "107410";
const WORKSHOP_CONTENT_REL = path.join("steamapps", "workshop", "content", WORKSHOP_APP_ID);
const WORKSHOP_CONTENT_SUFFIX = `${path.sep}workshop${path.sep}content${path.sep}${WORKSHOP_APP_ID}`.toLowerCase();

/** 展开 Linux/macOS 常见的 ~/ 前缀路径。 */
export function expandUserPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

function resolveConfiguredPath(input: string): string {
  return path.resolve(expandUserPath(input));
}

export function isModDirectory(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, "addons"));
}

export function isWorkshopContentRoot(root: string): boolean {
  const normalized = root.replace(/\//g, path.sep).toLowerCase();
  return normalized.endsWith(WORKSHOP_CONTENT_SUFFIX);
}

/** 若根路径是 Steam/SteamCMD 安装目录，则落到 workshop/content/107410。 */
export function resolveEffectiveScanRoot(root: string): string {
  if (!root) {
    return root;
  }
  const normalized = resolveConfiguredPath(root);
  if (!fs.existsSync(normalized)) {
    return normalized;
  }
  if (isModDirectory(normalized)) {
    return normalized;
  }
  if (isWorkshopContentRoot(normalized)) {
    return normalized;
  }

  const contentUnderRoot = path.join(normalized, WORKSHOP_CONTENT_REL);
  if (fs.existsSync(contentUnderRoot)) {
    return contentUnderRoot;
  }

  if (path.basename(normalized).toLowerCase() === "steamapps") {
    const contentUnderSteamapps = path.join(normalized, "workshop", "content", WORKSHOP_APP_ID);
    if (fs.existsSync(contentUnderSteamapps)) {
      return contentUnderSteamapps;
    }
  }

  return normalized;
}

export function workshopContentPath(workshopRoot: string): string {
  return path.join(workshopRoot.trim(), WORKSHOP_CONTENT_REL);
}

/** 从模组扫描路径反推 SteamCMD force_install_dir 所需的 Steam 库根目录。 */
export function resolveWorkshopInstallRootFromScanPath(scanPath: string): string | null {
  if (!scanPath?.trim()) {
    return null;
  }

  const normalized = resolveConfiguredPath(scanPath);
  if (isModDirectory(normalized)) {
    return null;
  }

  if (isWorkshopContentRoot(normalized)) {
    return path.dirname(path.dirname(path.dirname(path.dirname(normalized))));
  }

  const marker = `${path.sep}steamapps${path.sep}workshop${path.sep}content${path.sep}${WORKSHOP_APP_ID}`;
  const lower = normalized.replace(/\//g, path.sep).toLowerCase();
  const markerIndex = lower.indexOf(marker);
  if (markerIndex > 0) {
    return normalized.slice(0, markerIndex);
  }

  if (path.basename(normalized).toLowerCase() === "steamapps") {
    return path.dirname(normalized);
  }

  const contentUnderRoot = path.join(normalized, WORKSHOP_CONTENT_REL);
  if (fs.existsSync(contentUnderRoot)) {
    return normalized;
  }

  if (fs.existsSync(path.join(normalized, "steamapps"))) {
    return normalized;
  }

  return null;
}

export function resolveWorkshopInstallRootFromScanPaths(scanPaths: readonly string[]): string | null {
  for (const scanPath of scanPaths) {
    const root = resolveWorkshopInstallRootFromScanPath(scanPath);
    if (root) {
      return root;
    }
  }
  return null;
}

export function ensureDefaultWorkshopScanPath(
  store: { list: () => ModScanPathEntry[]; save: (entries: ModScanPathEntry[]) => void },
  workshopRoot: string
): void {
  const trimmed = workshopRoot.trim();
  if (!trimmed) {
    return;
  }
  ensureWorkshopContentDirectory(trimmed);
  const contentPath = workshopContentPath(trimmed);
  if (!fs.existsSync(contentPath)) {
    return;
  }

  const paths = store.list();
  const exists = paths.some((item) => {
    return item.modulePath.toLowerCase() === contentPath.toLowerCase();
  });
  if (exists) {
    return;
  }

  paths.push({
    modulePath: contentPath,
    remark: "自动设置的 SteamCMD 模组路径",
  });
  store.save(paths);
}

export function collectModPaths(app: FastifyInstance, config: ServerConfigPackage): string[] {
  const settings = app.steamCmdSettingsStore.load();
  if (settings.workshopRoot.trim()) {
    ensureDefaultWorkshopScanPath(app.modScanPathStore, settings.workshopRoot);
  }

  const globalPaths = app.modScanPathStore.list().map((entry) => entry.modulePath);
  const resolved = resolveModPaths(config, globalPaths);

  const localPaths = (config.mods?.localMods ?? []).map((entry) => entry.path).filter(Boolean);
  const merged = new Set<string>();
  for (const p of resolved) {
    if (p) {
      merged.add(p);
    }
  }
  for (const p of localPaths) {
    if (p) {
      merged.add(p);
    }
  }
  return [...merged];
}

export interface ExpandedScanTarget {
  modPath: string;
  prefix?: string;
}

export function expandScanTargets(scanRoots: string[], scanPathEntries: ModScanPathEntry[]): ExpandedScanTarget[] {
  const prefixByRoot = new Map<string, string>();
  for (const entry of scanPathEntries) {
    if (entry.modulePath) {
      prefixByRoot.set(entry.modulePath.toLowerCase(), entry.prefix ?? "");
    }
  }

  const targets: ExpandedScanTarget[] = [];
  const seen = new Set<string>();

  for (const root of scanRoots) {
    if (!root || !fs.existsSync(root)) {
      continue;
    }

    const effectiveRoot = resolveEffectiveScanRoot(root);

    if (isModDirectory(effectiveRoot)) {
      const realPath = fs.realpathSync(effectiveRoot);
      if (!seen.has(realPath)) {
        seen.add(realPath);
        targets.push({ modPath: effectiveRoot });
      }
      continue;
    }

    const prefix = prefixByRoot.get(root.toLowerCase()) ?? prefixByRoot.get(effectiveRoot.toLowerCase()) ?? "";
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(effectiveRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (prefix && !entry.name.includes(prefix)) {
        continue;
      }
      const fullPath = path.join(effectiveRoot, entry.name);
      if (!isModDirectory(fullPath)) {
        continue;
      }
      let realPath = fullPath;
      try {
        realPath = fs.realpathSync(fullPath);
      } catch {
        continue;
      }
      if (seen.has(realPath)) {
        continue;
      }
      seen.add(realPath);
      targets.push({ modPath: fullPath });
    }
  }

  return targets;
}
