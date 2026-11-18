import * as fs from "node:fs";
import * as path from "node:path";

export type WorkshopUpdateStatus = "missing" | "up_to_date" | "outdated" | "unknown";

/** Written after a confirmed SteamCMD workshop download so stale pack mtimes cannot fake "outdated". */
export const WORKSHOP_SYNC_MARKER = ".a3st-synced";

export interface LocalModRef {
  modId: number;
  path?: string;
  updatedAt?: string;
  /**
   * Steam `appworkshop_*.acf` `timeupdated` for this item (unix seconds).
   * Preferred over filesystem mtimes when present.
   */
  workshopAcfTimeUpdated?: number;
}

export function formatUnixTime(unixSeconds: number): string {
  if (!Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return "-";
  }
  const date = new Date(unixSeconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function readSyncMarkerMs(modPath: string): number | undefined {
  const markerPath = path.join(modPath, WORKSHOP_SYNC_MARKER);
  if (!fs.existsSync(markerPath)) {
    return undefined;
  }
  try {
    const raw = fs.readFileSync(markerPath, "utf-8").trim();
    if (raw) {
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
      const asUnix = Number(raw);
      if (Number.isFinite(asUnix) && asUnix > 1_000_000_000) {
        // Accept unix seconds or ms.
        return asUnix > 1e12 ? asUnix : asUnix * 1000;
      }
    }
  } catch {
    // fall through to mtime
  }
  try {
    return fs.statSync(markerPath).mtimeMs;
  } catch {
    return undefined;
  }
}

/**
 * Record that SteamCMD successfully synced this mod folder.
 * Touches the directory mtime and writes a marker so pack-preserved file
 * timestamps no longer report "有更新" after a successful download.
 */
export function markWorkshopModContentSynced(
  modContentPath: string,
  when: Date = new Date(),
): void {
  const trimmed = modContentPath?.trim();
  if (!trimmed || !fs.existsSync(trimmed)) {
    return;
  }
  try {
    fs.writeFileSync(
      path.join(trimmed, WORKSHOP_SYNC_MARKER),
      when.toISOString(),
      "utf-8",
    );
  } catch {
    // best effort
  }
  try {
    fs.utimesSync(trimmed, when, when);
  } catch {
    // best effort
  }
}

export function markWorkshopModsSynced(
  workshopRoot: string,
  modIds: readonly number[],
  when: Date = new Date(),
): void {
  const root = workshopRoot?.trim();
  if (!root || !modIds.length) {
    return;
  }
  const contentRoot = path.join(
    root,
    "steamapps",
    "workshop",
    "content",
    "107410",
  );
  for (const modId of modIds) {
    if (!modId || modId <= 0) {
      continue;
    }
    markWorkshopModContentSynced(path.join(contentRoot, String(modId)), when);
  }
}

export function readLocalUpdatedAtMs(local?: LocalModRef): number | undefined {
  const signals: number[] = [];

  // Steam ACF timeupdated is the authoritative "what SteamCMD last synced"
  // signal and survives author-pack mtimes that lag Workshop time_updated.
  if (local?.workshopAcfTimeUpdated && local.workshopAcfTimeUpdated > 0) {
    signals.push(local.workshopAcfTimeUpdated * 1000);
  }

  // meta.cpp timestamp (author build time). May lag the Workshop's
  // time_updated even when content is current, so it alone is unreliable.
  if (local?.updatedAt) {
    const parsed = Date.parse(local.updatedAt);
    if (Number.isFinite(parsed) && parsed > 0) {
      signals.push(parsed);
    }
  }

  // Filesystem mtime reflects when SteamCMD actually wrote the content and is
  // the strongest "we already synced this" signal. Take the MAX of all signals
  // instead of trusting the (older) meta timestamp.
  if (local?.path && fs.existsSync(local.path)) {
    const markerMs = readSyncMarkerMs(local.path);
    if (markerMs) {
      signals.push(markerMs);
    }
    try {
      const stat = fs.statSync(local.path);
      const dirMtime = stat.mtimeMs;
      signals.push(dirMtime);
      // A mod dir's top-level mtime doesn't always change on re-download; scan
      // the largest mtime among immediate entries as an extra signal.
      try {
        for (const child of fs.readdirSync(local.path).slice(0, 20)) {
          if (child === WORKSHOP_SYNC_MARKER) {
            continue;
          }
          try {
            const cm = fs.statSync(path.join(local.path, child)).mtimeMs;
            if (cm > 0) {
              signals.push(cm);
            }
          } catch {
            // skip unreadable child
          }
        }
      } catch {
        // readdir failed; ignore
      }
    } catch {
      // stat failed; ignore
    }
  }

  if (signals.length === 0) {
    return undefined;
  }
  return Math.max(...signals);
}

export function resolveUpdateStatus(
  remoteTimeUpdated?: number,
  localUpdatedAtMs?: number,
  hasLocalPath?: boolean
): WorkshopUpdateStatus {
  if (!hasLocalPath) {
    return "missing";
  }
  if (!remoteTimeUpdated || remoteTimeUpdated <= 0) {
    return "unknown";
  }
  if (!localUpdatedAtMs || localUpdatedAtMs <= 0) {
    return "unknown";
  }
  const remoteMs = remoteTimeUpdated * 1000;
  // Tolerance covers clock skew and SteamCMD preserving slightly-older file
  // mtimes than the Workshop's recorded update second.
  if (localUpdatedAtMs + 1_800_000 >= remoteMs) {
    return "up_to_date";
  }
  return "outdated";
}

export function updateStatusLabel(status: WorkshopUpdateStatus): string {
  switch (status) {
    case "missing":
      return "未安装";
    case "up_to_date":
      return "已最新";
    case "outdated":
      return "有更新";
    default:
      return "未知";
  }
}
