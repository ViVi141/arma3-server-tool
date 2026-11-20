import type { ModBikeyStatus, ModMetaRow } from "@a3st/api-client";

export const signatureStates: ModBikeyStatus[] = [
  "ready", "partial", "unsigned", "no_key", "not_copied", "key_mismatch", "unknown", "read_error",
];
export interface ModFilters {
  search: string;
  enabled: string[];
  roles: string[];
  updates: string[];
  signatures: string[];
  sources: string[];
}
export function emptyModFilters(): ModFilters {
  return { search: "", enabled: [], roles: [], updates: [], signatures: [], sources: [] };
}
export function restoreModFilters(raw: string | null): ModFilters {
  const result = emptyModFilters();
  try {
    const input = JSON.parse(raw ?? "{}");
    if (!input || typeof input !== "object") return result;
    if (typeof input.search === "string") result.search = input.search.slice(0, 1000);
    const allowed = {
      enabled: ["enabled", "disabled"], roles: ["client", "server", "hc"],
      updates: ["outdated", "up_to_date", "missing", "unknown"], signatures: signatureStates,
      sources: ["local", "workshop"],
    };
    for (const key of Object.keys(allowed) as (keyof typeof allowed)[]) {
      if (Array.isArray(input[key])) result[key] = input[key].filter((v: unknown) => typeof v === "string" && (allowed[key] as string[]).includes(v));
    }
  } catch { /* 损坏或旧版本存储使用默认值。 */ }
  return result;
}

/** 不同维度 AND，同维度 OR；未知状态始终可以被筛选。 */
export function matchesModFilters(row: ModMetaRow, filters: ModFilters): boolean {
  const includes = (values: string[], value: string) => !values.length || values.includes(value);
  const query = filters.search.trim().toLocaleLowerCase();
  return (!query || [row.name, row.dirName ?? "", String(row.workshopId), row.path].some((s) => s.toLocaleLowerCase().includes(query)))
    && includes(filters.enabled, row.enabled ? "enabled" : "disabled")
    && (!filters.roles.length || filters.roles.some((role) => role === "client" ? row.isClientMod : role === "server" ? row.isServerMod : row.isHcMod))
    && includes(filters.updates, row.updateStatus ?? "unknown")
    && includes(filters.signatures, row.bikeyStatus ?? "unknown")
    && includes(filters.sources, row.isLocalMod || row.workshopId <= 0 ? "local" : "workshop");
}

export function modSignatureRisk(row: ModMetaRow): string {
  if (!row.enabled) return "未启用：不据此判断当前入服风险";
  if (row.isClientMod) return "客模：需核对客户端版本与服务器签名设置";
  return "仅服模／HC：文件缺签名不等同于玩家入服阻断";
}

export function canDeployModKeys(row: ModMetaRow): boolean {
  return !!row.path && (row.bikeyStatus === "not_copied" || row.bikeyStatus === "key_mismatch")
    && row.signatureEvidence?.canDeployKeys !== false;
}

/** 单元格转义及公式注入防护；路径和原因含换行时仍保持一个单元格。 */
function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function exportModRows(rows: (ModMetaRow & { bikeyLabel?: string; bikeyHint?: string })[], csv = false): string {
  const values = rows.map((row) => [row.name, row.workshopId || "本地", row.path,
    row.bikeyLabel ?? row.bikeyStatus ?? "未检查", row.signatureEvidence?.reason ?? row.bikeyHint ?? "尚未检查",
    modSignatureRisk(row)]);
  if (csv) return "\uFEFF" + [["名称", "Workshop ID", "路径", "文件状态", "原因", "角色风险"], ...values].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return values.map((row) => row.map((cell) => String(cell).replace(/[\r\n\t]+/g, " ")).join("\t")).join("\n");
}
