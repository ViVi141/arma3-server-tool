import type { BikeySummaryData, ModBikeyStatus } from "@a3st/api-client";

const labels: Record<ModBikeyStatus, string> = {
  ready: "文件检查就绪", partial: "部分 PBO 缺签名", unsigned: "未发现签名",
  no_key: "缺少公钥", not_copied: "公钥未部署", key_mismatch: "公钥内容不一致",
  unknown: "未检查", read_error: "读取失败",
};

/** 符号仅作辅助，中文状态和文件证据始终可见。 */
export function bikeyStatusIcon(status: ModBikeyStatus | undefined): string {
  return status === "ready" ? "✓" : status === "unknown" ? "?" : "!";
}

export function formatBikeySummary(summary: BikeySummaryData): string {
  return `文件检查 · 已启用 ${summary.enabled} 个 · 就绪 ${summary.ready} · 待处理 ${summary.needsAttention ?? summary.enabled - summary.ready}`;
}

export function bikeyStatusHint(status: ModBikeyStatus): string {
  switch (status) {
    case "ready": return "每个 PBO 均找到签名文件，公钥内容与服务器匹配；未进行密码学验证。";
    case "partial": return "部分 PBO 未找到对应签名文件；请检查模组来源或联系作者，复制公钥不能修复。";
    case "unsigned": return "PBO 未找到对应签名文件；请检查模组来源或联系作者，不能通过复制公钥修复。";
    case "no_key": return "已有签名文件，但未找到公钥；请从可信模组来源获取 .bikey。";
    case "not_copied": return "公钥尚未部署；可选择此模组后部署到服务器 Keys/。";
    case "key_mismatch": return "已部署的同名公钥内容不同；可选择此模组重新部署公钥。";
    case "read_error": return "文件读取失败，证据不完整；检查路径与权限后重新扫描。";
    default: return "尚未确认签名覆盖；请扫描并检查模组路径。";
  }
}

export function bikeyStatusLabel(status: ModBikeyStatus): string {
  return labels[status] ?? labels.unknown;
}
