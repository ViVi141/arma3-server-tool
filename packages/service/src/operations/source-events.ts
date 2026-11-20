import { createHash } from "node:crypto";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ModMeta } from "../types/mods.js";
import type { OperationEventInput } from "../types/operations.js";

export interface DownloadScope { serverUuids: string[]; modIds: number[]; batchId?: string | null }
const sameScope = (event: OperationEventInput, scope: DownloadScope) =>
  JSON.stringify([...event.serverUuids].sort()) === JSON.stringify([...new Set(scope.serverUuids)].sort()) &&
  JSON.stringify([...event.modIds].sort((a, b) => a - b)) === JSON.stringify([...new Set(scope.modIds)].sort((a, b) => a - b)) &&
  event.batchId === (scope.batchId ?? null);

/** 手动和旧任务入口共用；受保护维护的阶段事件由维护状态机单独记录。 */
export async function observeDownload<T>(app: FastifyInstance, scope: DownloadScope, operation: () => Promise<T>): Promise<T> {
  let result: T;
  try { result = await operation(); }
  catch (error) {
    const needsAuth = ["waiting_guard", "guard_timeout", "auth_failed"].includes(app.steamCmd.authState) || !app.steamCmd.hasCredentials;
    app.operations?.record({ type: needsAuth ? "authentication_required" : "download_failed", severity: "critical",
      serverUuids: scope.serverUuids, modIds: scope.modIds, batchId: scope.batchId ?? null,
      reasonCode: needsAuth ? "STEAM_AUTHENTICATION_REQUIRED" : "STEAM_DOWNLOAD_FAILED",
      message: needsAuth ? "SteamCMD 需要人工认证或补充登录配置，本次操作没有完成。" : "SteamCMD 下载未完成或被取消；当前文件不能视为完整更新。",
      suggestedAction: needsAuth ? "检查同一 SteamCMD 安装的缓存登录；在手机或 Steam 完成人工确认后，显式重试。不要连续触发登录。" : "检查磁盘、网络与 SteamCMD 记录；受保护维护应先完成恢复，再重试。",
      requiresAttention: true });
    throw error;
  }
  // 下载成功只解决同范围的下载/认证故障，不代表服务器健康或维护成功。
  for (const event of app.operations?.activeEvents() ?? []) {
    if (["authentication_required", "download_failed"].includes(event.type) && sameScope(event, scope)) app.operations.resolve(event.eventId);
  }
  return result;
}

/** 每个实际路径一个事件；unknown/读取失败不会被误恢复，缺席也不视为恢复。 */
export function recordSignatureEvents(app: FastifyInstance, uuid: string, mods: ModMeta[]): void {
  if (!app.operations) return;
  const active = app.operations.activeEvents();
  for (const mod of mods) {
    const normalized = path.resolve(mod.path);
    const key = process.platform === "win32" ? normalized.toLowerCase() : normalized;
    const reasonCode = `SIGNATURE_FILES_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
    const existing = active.filter((event) => event.type === "signature_degraded" && event.reasonCode === reasonCode && event.serverUuids.includes(uuid) && event.batchId === null);
    if (mod.bikeyStatus === "ready") {
      for (const event of existing) app.operations.resolve(event.eventId);
    } else if (mod.enabled) {
      const client = Boolean(mod.isClientMod);
      app.operations.record({ type: "signature_degraded", severity: client ? "warning" : "info", serverUuids: [uuid],
        modIds: mod.workshopId > 0 ? [mod.workshopId] : [], batchId: null, reasonCode,
        message: `${mod.name}（${mod.path}）：${mod.signatureEvidence?.reason ?? mod.bikeyStatus ?? "未检查"}。${client ? "客户端模组需要检查文件证据。" : "服务端/HC 专用模组，缺签名不直接等于玩家加入受阻。"}`,
        suggestedAction: "打开签名工作台检查具体 PBO 与公钥证据。仅适用项可部署公钥；缺签名/缺公钥需人工处理，不关闭签名校验。这不是密码学验证。",
        requiresAttention: client || mod.bikeyStatus === "read_error" || mod.bikeyStatus === "unknown" || !mod.bikeyStatus });
    }
  }
}
