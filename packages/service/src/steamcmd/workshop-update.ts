import * as fs from "node:fs";

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
  if (local?.updatedAt) {
    const parsed = Date.parse(local.updatedAt);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (local?.path && fs.existsSync(local.path)) {
    try {
      return fs.statSync(local.path).mtimeMs;
    } catch {
      return undefined;
    }
  }
  return undefined;
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
  if (localUpdatedAtMs + 120_000 >= remoteMs) {
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
