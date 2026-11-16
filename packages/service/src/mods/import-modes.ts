export type ModImportMode =
  | "download_only"
  | "merge_enable"
  | "replace_enable"
  | "download_and_enable";

export interface ModImportPreviewItem {
  modId: number;
  status: "new" | "missing" | "already_enabled" | "present_disabled";
}

export interface ModImportPreview {
  modIds: number[];
  mode: ModImportMode;
  items: ModImportPreviewItem[];
  newCount: number;
  missingCount: number;
  alreadyEnabledCount: number;
  presentDisabledCount: number;
}

export function normalizeModImportMode(raw: unknown): ModImportMode {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "download_only" || value === "download") {
    return "download_only";
  }
  if (value === "merge_enable" || value === "merge" || value === "enable") {
    return "merge_enable";
  }
  if (value === "replace_enable" || value === "replace") {
    return "replace_enable";
  }
  // 兼容旧默认：下载并合并启用
  return "download_and_enable";
}

export function buildModImportPreview(
  modIds: readonly number[],
  enabledIds: readonly number[],
  installedIds: readonly number[],
  mode: ModImportMode,
): ModImportPreview {
  const enabled = new Set(enabledIds.filter((id) => id > 0));
  const installed = new Set(installedIds.filter((id) => id > 0));
  const unique = [...new Set(modIds.filter((id) => id > 0))];
  const items: ModImportPreviewItem[] = unique.map((modId) => {
    if (enabled.has(modId)) {
      return { modId, status: "already_enabled" };
    }
    if (installed.has(modId)) {
      return { modId, status: "present_disabled" };
    }
    if (!installed.has(modId)) {
      return { modId, status: "missing" };
    }
    return { modId, status: "new" };
  });

  // missing = not installed; new = not enabled and not installed (same as missing for workshop)
  // Refine: treat non-installed as missing, installed-but-disabled as present_disabled
  for (const item of items) {
    if (item.status === "missing" && !installed.has(item.modId) && !enabled.has(item.modId)) {
      item.status = installed.has(item.modId) ? "present_disabled" : "missing";
    }
  }

  return {
    modIds: unique,
    mode,
    items,
    newCount: items.filter((i) => i.status === "missing" || i.status === "new").length,
    missingCount: items.filter((i) => i.status === "missing").length,
    alreadyEnabledCount: items.filter((i) => i.status === "already_enabled").length,
    presentDisabledCount: items.filter((i) => i.status === "present_disabled").length,
  };
}

export function applyEnableList(
  currentEnabled: readonly number[],
  importedIds: readonly number[],
  mode: ModImportMode,
): number[] | null {
  if (mode === "download_only") {
    return null;
  }
  if (mode === "replace_enable") {
    return [...new Set(importedIds.filter((id) => id > 0))];
  }
  // merge_enable / download_and_enable
  return [...new Set([...currentEnabled, ...importedIds].filter((id) => id > 0))];
}

export function shouldDownloadForMode(mode: ModImportMode): boolean {
  return mode === "download_only" || mode === "download_and_enable";
}
