import * as fs from "node:fs";
import * as path from "node:path";
import { ARMA3_WORKSHOP_APP_ID } from "./arguments.js";

const WORKSHOP_APP_ID = String(ARMA3_WORKSHOP_APP_ID);
const CONTENT_MARKER = `${path.sep}workshop${path.sep}content${path.sep}${WORKSHOP_APP_ID}`;
const ACF_NAME = `appworkshop_${WORKSHOP_APP_ID}.acf`;

/**
 * Resolve `steamapps/workshop/appworkshop_107410.acf` from a Steam library root
 * (`force_install_dir`) or from a mod folder under `workshop/content/107410/<id>`.
 */
export function resolveAppWorkshopAcfPath(workshopRootOrModPath: string): string | undefined {
  const trimmed = workshopRootOrModPath?.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = path.resolve(trimmed.replace(/\//g, path.sep));

  const fromRoot = path.join(normalized, "steamapps", "workshop", ACF_NAME);
  if (fs.existsSync(fromRoot)) {
    return fromRoot;
  }

  const lower = normalized.toLowerCase();
  const markerIndex = lower.lastIndexOf(CONTENT_MARKER.toLowerCase());
  if (markerIndex >= 0) {
    const workshopDir = normalized.slice(0, markerIndex + `${path.sep}workshop`.length);
    const acfPath = path.join(workshopDir, ACF_NAME);
    if (fs.existsSync(acfPath)) {
      return acfPath;
    }
  }

  // Mod path may be .../content/107410/<id> even when ACF is missing; still return
  // the expected location so callers can attempt a read later.
  if (markerIndex >= 0) {
    const workshopDir = normalized.slice(0, markerIndex + `${path.sep}workshop`.length);
    return path.join(workshopDir, ACF_NAME);
  }

  const expected = path.join(normalized, "steamapps", "workshop", ACF_NAME);
  return expected;
}

/** Parse Steam VDF appworkshop ACF text into publishedfileid → timeupdated (unix seconds). */
export function parseAppWorkshopTimeUpdatedMap(acfText: string): Map<number, number> {
  const result = new Map<number, number>();
  if (!acfText.trim()) {
    return result;
  }

  // Item blocks are flat: "12345" { "size" "…" "timeupdated" "1700000000" … }
  const blockRe = /"(\d{3,})"\s*\{([^{}]*)\}/g;
  let match: RegExpExecArray | null = blockRe.exec(acfText);
  while (match) {
    const modId = Number(match[1]);
    const body = match[2] ?? "";
    const timeMatch = /"timeupdated"\s+"(\d+)"/i.exec(body);
    if (modId > 0 && timeMatch) {
      const timeUpdated = Number(timeMatch[1]);
      if (Number.isFinite(timeUpdated) && timeUpdated > 0) {
        const previous = result.get(modId) ?? 0;
        if (timeUpdated > previous) {
          result.set(modId, timeUpdated);
        }
      }
    }
    match = blockRe.exec(acfText);
  }
  return result;
}

export function loadAppWorkshopTimeUpdatedMap(acfPath: string): Map<number, number> {
  if (!acfPath || !fs.existsSync(acfPath)) {
    return new Map();
  }
  try {
    const text = fs.readFileSync(acfPath, "utf-8");
    return parseAppWorkshopTimeUpdatedMap(text);
  } catch {
    return new Map();
  }
}

/**
 * Load ACF timeupdated maps for a batch of local mod paths (one parse per ACF file).
 * Returns modId → unix seconds.
 */
export function loadWorkshopAcfTimesForLocalMods(
  localMods: ReadonlyArray<{ modId: number; path?: string }>
): Map<number, number> {
  const byAcfPath = new Map<string, Map<number, number>>();
  const result = new Map<number, number>();

  for (const local of localMods) {
    if (!local.modId || !local.path?.trim()) {
      continue;
    }
    const acfPath = resolveAppWorkshopAcfPath(local.path);
    if (!acfPath) {
      continue;
    }
    let map = byAcfPath.get(acfPath);
    if (!map) {
      map = loadAppWorkshopTimeUpdatedMap(acfPath);
      byAcfPath.set(acfPath, map);
    }
    const timeUpdated = map.get(local.modId);
    if (timeUpdated && timeUpdated > 0) {
      result.set(local.modId, timeUpdated);
    }
  }
  return result;
}
