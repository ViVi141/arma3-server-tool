import * as fs from "node:fs";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";
import { resolveModPaths } from "./enabler.js";
import type { ModScanPathEntry } from "./scan-path-store.js";
import { ensureWorkshopContentDirectory } from "../settings/steamcmd-settings.js";

const WORKSHOP_APP_ID = "107410";
const WORKSHOP_CONTENT_REL = path.join("steamapps", "workshop", "content", WORKSHOP_APP_ID);
const WORKSHOP_CONTENT_SUFFIX = `${path.sep}workshop${path.sep}content${path.sep}${WORKSHOP_APP_ID}`.toLowerCase();

export function isModDirectory(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, "addons"));
}

export function isWorkshopContentRoot(root: string): boolean {
  const normalized = root.replace(/\//g, path.sep).toLowerCase();
  return normalized.endsWith(WORKSHOP_CONTENT_SUFFIX);
}

/** 若根路径是 Steam/SteamCMD 安装目录，则落到 workshop/content/107410。 */
export function resolveEffectiveScanRoot(root: string): string {
  if (!root || !fs.existsSync(root)) {
    return root;
  }
  if (isModDirectory(root)) {
    return root;
  }
  if (isWorkshopContentRoot(root)) {
    return root;
  }

  const contentUnderRoot = path.join(root, WORKSHOP_CONTENT_REL);
  if (fs.existsSync(contentUnderRoot)) {
    return contentUnderRoot;
  }

  if (path.basename(root).toLowerCase() === "steamapps") {
    const contentUnderSteamapps = path.join(root, "workshop", "content", WORKSHOP_APP_ID);
    if (fs.existsSync(contentUnderSteamapps)) {
      return contentUnderSteamapps;
    }
  }

  return root;
}

export function workshopContentPath(workshopRoot: string): string {
  return path.join(workshopRoot.trim(), WORKSHOP_CONTENT_REL);
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
