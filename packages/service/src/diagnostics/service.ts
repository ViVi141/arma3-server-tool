import * as fs from "node:fs";
import * as path from "node:path";
import type { ServerConfigPackage } from "../types/config.js";
import type { ModMeta } from "../types/mods.js";
import { runPreflightChecks, type PreflightIssue } from "../preflight/checker.js";
import {
  buildStartCommandLine,
  getServerExecutablePath,
} from "../config/game-config-writer.js";
import { collectModPaths } from "../mods/paths.js";
import { getServerKeysDirectory } from "../mods/bikey-service.js";
import type { FastifyInstance } from "fastify";
import { resolveSteamCmdPath } from "../platform/index.js";

export interface DiagnosticIssue {
  category: string;
  severity: "error" | "warning" | "info";
  message: string;
}

export function runFullDiagnostics(
  app: FastifyInstance,
  uuid: string,
  config: ServerConfigPackage,
  options?: { isRunning?: boolean; scannedMods?: ModMeta[] }
): { issues: DiagnosticIssue[]; hasBlockingErrors: boolean } {
  const preflight = runPreflightChecks(uuid, config, options);
  const issues: DiagnosticIssue[] = preflight.issues.map((item) => ({
    category: item.category,
    severity: item.severity,
    message: item.message,
  }));

  checkSteamCmd(app, issues);
  checkModScanPaths(app, config, issues);
  checkEnabledModBikeys(config, options?.scannedMods ?? [], issues);
  checkStartCommandLine(uuid, config, options?.scannedMods ?? [], issues);
  checkKeysDirectory(config, issues);

  const hasBlockingErrors = issues.some((item) => item.severity === "error");
  return { issues, hasBlockingErrors };
}

function checkSteamCmd(app: FastifyInstance, issues: DiagnosticIssue[]): void {
  const settings = app.steamCmdSettingsStore.load();
  const root = settings.workshopRoot.trim();
  if (!root) {
    issues.push({
      category: "SteamCMD",
      severity: "warning",
      message: "未配置 SteamCMD/Workshop 根目录；模组下载与专用服务器安装将不可用",
    });
    return;
  }

  if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(root)) {
    issues.push({
      category: "SteamCMD",
      severity: "warning",
      message: `Workshop 根路径包含中文: ${root}`,
    });
  }

  const steamCmdEntry = resolveSteamCmdPath(root);
  if (fs.existsSync(steamCmdEntry)) {
    issues.push({
      category: "SteamCMD",
      severity: "info",
      message: `SteamCMD 已安装: ${root}`,
    });
  } else {
    issues.push({
      category: "SteamCMD",
      severity: "warning",
      message: `未找到 SteamCMD: ${steamCmdEntry}`,
    });
  }
}

function checkModScanPaths(
  app: FastifyInstance,
  config: ServerConfigPackage,
  issues: DiagnosticIssue[]
): void {
  const paths = collectModPaths(app, config);
  if (paths.length === 0) {
    issues.push({
      category: "模组",
      severity: "warning",
      message: "未配置模组扫描路径",
    });
    return;
  }

  let existing = 0;
  for (const scanPath of paths) {
    if (fs.existsSync(scanPath)) {
      existing += 1;
    }
  }
  issues.push({
    category: "模组",
    severity: existing === paths.length ? "info" : "warning",
    message: `模组扫描路径 ${existing}/${paths.length} 个存在`,
  });
}

function checkEnabledModBikeys(
  config: ServerConfigPackage,
  scannedMods: ModMeta[],
  issues: DiagnosticIssue[]
): void {
  const enabled = scannedMods.filter((mod) => mod.enabled);
  if (enabled.length === 0) {
    return;
  }

  const pending = enabled.filter((mod) => mod.bikeyStatus !== "ready");
  const counts = new Map<string, number>();
  for (const mod of pending) {
    const label = mod.bikeyLabel ?? "未检查";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  issues.push({
    category: "Bikey",
    severity: pending.length ? "warning" : "info",
    message: pending.length
      ? `${pending.length} 个已启用模组文件检查待处理：${[...counts].map(([label, count]) => `${label} ${count}`).join("，")}。仅服模／HC 缺签名不等同于玩家入服阻断。`
      : `已启用模组文件检查就绪（${enabled.length}/${enabled.length}）；非密码学验证，不保证玩家可以加入。`,
  });
}

function checkStartCommandLine(
  uuid: string,
  config: ServerConfigPackage,
  mods: ModMeta[],
  issues: DiagnosticIssue[]
): void {
  const cmdLine = buildStartCommandLine(uuid, config, mods);
  issues.push({
    category: "启动",
    severity: "info",
    message: `启动命令行长度 ${cmdLine.length} 字符`,
  });
}

function checkKeysDirectory(config: ServerConfigPackage, issues: DiagnosticIssue[]): void {
  const serverDir = config.server?.serverDir?.trim();
  if (!serverDir) {
    return;
  }
  const keysDir = getServerKeysDirectory(serverDir);
  if (!fs.existsSync(keysDir)) {
    issues.push({
      category: "Keys",
      severity: "warning",
      message: "服务器 keys 目录不存在",
    });
    return;
  }

  const count = fs.readdirSync(keysDir).filter((f) => f.toLowerCase().endsWith(".bikey")).length;
  issues.push({
    category: "Keys",
    severity: "info",
    message: `服务器 keys 目录含 ${count} 个 .bikey 文件`,
  });
}
