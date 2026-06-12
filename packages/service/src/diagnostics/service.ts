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
import type { FastifyInstance } from "fastify";

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
  checkStartCommandLine(uuid, config, issues);
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

  const steamCmdExe = path.join(root, "steamcmd.exe");
  if (fs.existsSync(steamCmdExe)) {
    issues.push({
      category: "SteamCMD",
      severity: "info",
      message: `SteamCMD 已安装: ${root}`,
    });
  } else {
    issues.push({
      category: "SteamCMD",
      severity: "warning",
      message: `未找到 steamcmd.exe: ${steamCmdExe}`,
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
  const enabledIds = new Set(config.mods?.enabledIds ?? []);
  const enabledLocal = new Set(
    (config.mods?.enabledLocalPaths ?? []).map((p) => p.toLowerCase())
  );

  let missing = 0;
  for (const mod of scannedMods) {
    if (!mod.enabled) {
      continue;
    }
    if (mod.isLocalMod && mod.path && enabledLocal.has(mod.path.toLowerCase())) {
      if (!mod.bikeyPresent) {
        missing += 1;
      }
      continue;
    }
    if (enabledIds.has(mod.workshopId) && !mod.bikeyPresent) {
      missing += 1;
    }
  }

  if (missing > 0) {
    issues.push({
      category: "Bikey",
      severity: "warning",
      message: `${missing} 个已启用模组缺少 Bikey`,
    });
  } else {
    issues.push({
      category: "Bikey",
      severity: "info",
      message: "已启用模组的 Bikey 检查通过",
    });
  }
}

function checkStartCommandLine(
  uuid: string,
  config: ServerConfigPackage,
  issues: DiagnosticIssue[]
): void {
  const cmdLine = buildStartCommandLine(uuid, config);
  if (cmdLine.length > 8191) {
    issues.push({
      category: "启动",
      severity: "error",
      message: `启动命令行过长 (${cmdLine.length} 字符，Windows 上限 8191)`,
    });
    return;
  }
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
  const keysDir = path.join(serverDir, "keys");
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
