import type { ModBikeyStatus } from "@a3st/api-client";

export function bikeyStatusIcon(status: ModBikeyStatus | "unknown" | undefined): string {
  if (status === "ready") {
    return "🟢";
  }
  if (status === "not_copied" || status === "no_key") {
    return "🟡";
  }
  if (status === "unsigned") {
    return "🔴";
  }
  return "⚫";
}

export function formatBikeySummary(summary: {
  enabled: number;
  ready: number;
  needsAttention: number;
  unsigned: number;
  unchecked: number;
}): string {
  if (summary.enabled === 0) {
    return "Bikey 就绪 · 已启用模组: 0";
  }
  let text = `Bikey 就绪 · 已启用 ${summary.enabled}  · 🟢 ${summary.ready}  · 🟡 ${summary.needsAttention}  · 🔴 ${summary.unsigned}`;
  if (summary.unchecked > 0) {
    text += `  · ⚫ ${summary.unchecked}`;
  }
  return text;
}
