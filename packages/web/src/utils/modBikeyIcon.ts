import type { ModBikeyStatus } from "@a3st/api-client";

/** Icon for each bikey state. Only `ready` passes validation. */
export function bikeyStatusIcon(status: ModBikeyStatus | "unknown" | undefined): string {
  if (status === "ready") {
    return "🟢";
  }
  if (status === "not_copied") {
    return "🟡";
  }
  if (status === "no_key") {
    return "🟠";
  }
  if (status === "unsigned") {
    return "🔴";
  }
  return "⚫";
}

export function formatBikeySummary(summary: {
  enabled: number;
  ready: number;
  notCopied: number;
  noKey: number;
  unsigned: number;
  unchecked: number;
  allValid?: boolean;
}): string {
  if (summary.enabled === 0) {
    return "签名校验 · 已启用 0 个模组";
  }
  let text = `签名校验 · 已启用 ${summary.enabled} 个 · 🟢 通过 ${summary.ready} · 🟡 未复制 ${summary.notCopied} · 🟠 缺密钥 ${summary.noKey} · 🔴 未签名 ${summary.unsigned}`;
  if (summary.unchecked > 0) {
    text += ` · ⚫ 未检查 ${summary.unchecked}`;
  }
  if (summary.allValid === false && summary.ready < summary.enabled) {
    text += " · 未全部通过";
  }
  return text;
}

export function bikeyStatusHint(status: ModBikeyStatus | "unknown"): string {
  if (status === "ready") {
    return "验证通过：已同时具备 bisign、key，且 key 已复制到服务器 Keys/。";
  }
  if (status === "not_copied") {
    return "未通过验证：已有 bisign 和 key，但 key 尚未复制到服务器 Keys/。";
  }
  if (status === "no_key") {
    return "未通过验证：已有 bisign，但模组目录中未找到 .bikey。";
  }
  if (status === "unsigned") {
    return "未通过验证：未检测到 bisign（缺少签名）。";
  }
  return "尚未扫描签名状态。";
}

export function bikeyStatusLabel(status: ModBikeyStatus | "unknown"): string {
  if (status === "ready") {
    return "验证通过";
  }
  if (status === "not_copied") {
    return "未复制";
  }
  if (status === "no_key") {
    return "无密钥";
  }
  if (status === "unsigned") {
    return "未签名";
  }
  return "—";
}
