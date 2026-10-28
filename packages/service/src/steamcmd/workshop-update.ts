import * as fs from "node:fs";
import * as path from "node:path";

export type WorkshopUpdateStatus = "missing" | "up_to_date" | "outdated" | "unknown";

export interface LocalModRef {
  modId: number;
  path?: string;
  updatedAt?: string;
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

export function readLocalUpdatedAtMs(local?: LocalModRef): number | undefined {
  const signals: number[] = [];

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
    try {
      const stat = fs.statSync(local.path);
      const dirMtime = stat.mtimeMs;
      signals.push(dirMtime);
      // A mod dir's top-level mtime doesn't always change on re-download; scan
      // the largest mtime among immediate entries as an extra signal.
      try {
        for (const child of fs.readdirSync(local.path).slice(0, 20)) {
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
