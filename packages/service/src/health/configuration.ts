import * as fs from "node:fs";
import * as path from "node:path";
import type { ServerConfigPackage } from "../types/config.js";

export const HEALTH_THRESHOLDS = { heartbeatSeconds: 15, sampleSeconds: 10, staleSeconds: 90, startupTimeoutSeconds: 600 };

export function startupTimeoutSeconds(config: ServerConfigPackage): number {
  const value = config.health?.startupTimeoutSeconds;
  return typeof value === "number" && Number.isFinite(value) ? Math.max(120, Math.min(1800, Math.round(value))) : 600;
}

export function isConfiguredTrue(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function missionTemplateExists(config: ServerConfigPackage): boolean {
  const template = config.tasks?.missions?.[0]?.template?.trim();
  if (!template || /[\\/\0"\r\n]/.test(template) || template.includes("..")) return false;
  if (!config.server?.serverDir) return false;
  const root = path.join(config.server.serverDir, "mpmissions");
  const basename = template.replace(/\.pbo$/i, "");
  try {
    return [path.join(root, `${basename}.pbo`), path.join(root, basename, "mission.sqm")]
      .some((file) => fs.statSync(file, { throwIfNoEntry: false })?.isFile());
  } catch { return false; }
}

export function healthConfigurationIssues(config: ServerConfigPackage): string[] {
  const issues: string[] = [];
  if (config.health?.enabled !== true) issues.push("未启用独立健康心跳");
  if (isConfiguredTrue(config.basic?.noLogs)) issues.push("已禁用 RPT（noLogs），无法接收独立心跳");
  // 附加参数能覆盖工具生成的配置，必须显式提示，而不是假装组合已生效。
  const extras = [config.startup?.parameters, config.startup?.startArgs,
    Buffer.from(String(config.startup?.startConfigArgs ?? ""), "base64").toString("utf8")].join(" ");
  if (/(?:^|[\s"])-(?:noLogs|profiles|name|serverMod|mod|config)(?:[=\s"]|$)/i.test(extras)) {
    issues.push("附加启动参数包含日志、profile、配置或模组覆盖项，请移除冲突后应用更改");
  }
  if (!config.battleye?.rconPassword || config.basic?.battlEye === false) issues.push("RCon 未配置或 BattlEye 已关闭，无法确认服务响应和在线人数");
  if (config.health?.unattended) {
    if (!isConfiguredTrue(config.startup?.autoInit)) issues.push("无人运行需要开启 autoInit");
    if (!isConfiguredTrue(config.basic?.persistent)) issues.push("无人运行需要开启 persistent");
    if (!missionTemplateExists(config)) issues.push("无人运行需要指定已存在的启动任务模板（MPMissions）");
  }
  return issues;
}

export function validateHealthConfig(config: ServerConfigPackage): void {
  const health = config.health;
  if (!health) return;
  if (typeof health !== "object" || Array.isArray(health)) throw new Error("健康配置必须为对象");
  for (const key of ["enabled", "unattended"] as const) {
    if (health[key] !== undefined && typeof health[key] !== "boolean") throw new Error(`health.${key} 必须为布尔值`);
  }
  const timeout = health.startupTimeoutSeconds;
  if (timeout !== undefined && (!Number.isInteger(timeout) || timeout < 120 || timeout > 1800)) {
    throw new Error("健康启动等待必须为 120—1800 秒");
  }
  if (health.unattended && !missionTemplateExists(config)) throw new Error("无人运行需要已存在的启动任务模板，请先上传或扫描 MPMissions");
}
