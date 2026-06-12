import * as fs from "node:fs";
import * as path from "node:path";
import type { ServerConfigPackage } from "../types/config.js";

const MONITORING_DLL = "DestinyServerMonitoring_x64.dll";
const MONITORING_MOD = "@a3st_monitor";

export function resolveBundledAssets(dataDir: string): {
  dllPath: string;
  modPath: string;
} {
  const candidates = [
    path.join(process.cwd(), "mod", MONITORING_MOD),
    path.join(process.cwd(), "..", "..", "mod", MONITORING_MOD),
    path.join(dataDir, "bundled", "mod", MONITORING_MOD),
  ];

  let modPath = "";
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      modPath = candidate;
      break;
    }
  }

  const dllCandidates = [
    path.join(process.cwd(), "monitoring-server", MONITORING_DLL),
    path.join(process.cwd(), "..", "..", "monitoring-server", MONITORING_DLL),
    path.join(dataDir, "bundled", "monitoring-server", MONITORING_DLL),
  ];

  let dllPath = "";
  for (const candidate of dllCandidates) {
    if (fs.existsSync(candidate)) {
      dllPath = candidate;
      break;
    }
  }

  return { dllPath, modPath };
}

export function hasBundledMonitoringAssets(dataDir: string): boolean {
  const assets = resolveBundledAssets(dataDir);
  return !!assets.modPath;
}

export function deployMonitoringIfEnabled(
  dataDir: string,
  config: ServerConfigPackage
): { success: boolean; message: string } {
  const monitoring = config.monitoring ?? {};
  const enabled = !!(monitoring.enabled ?? monitoring.modEnabled);
  if (!enabled) {
    return { success: true, message: "监控未启用，跳过部署" };
  }

  const serverDir = config.server?.serverDir?.trim();
  if (!serverDir) {
    return { success: false, message: "未配置服务器目录，无法部署监控组件" };
  }
  if (!fs.existsSync(serverDir)) {
    return { success: false, message: `服务器目录不存在: ${serverDir}` };
  }

  const assets = resolveBundledAssets(dataDir);
  if (!assets.modPath) {
    return {
      success: false,
      message: `未找到监控模组 ${MONITORING_MOD}，请确认仓库 mod 目录存在`,
    };
  }

  try {
    if (assets.dllPath) {
      copyFileIfChanged(assets.dllPath, path.join(serverDir, MONITORING_DLL));
    }

    const targetModPath = path.join(serverDir, MONITORING_MOD);
    copyDirectoryIfChanged(assets.modPath, targetModPath);

    const initPath = path.join(targetModPath, "addons", "a3st_monitor", "fn_initFunctions.sqf");
    fs.mkdirSync(path.dirname(initPath), { recursive: true });
    writeTextIfChanged(initPath, buildInitFunctionsScript(config));

    if (!assets.dllPath) {
      return {
        success: true,
        message: "监控模组已部署（未找到 DestinyServerMonitoring DLL，FPS 采集可能不可用）",
      };
    }
    return { success: true, message: "监控组件已部署" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, message: `部署监控组件失败: ${message}` };
  }
}

export function buildInitFunctionsScript(config: ServerConfigPackage): string {
  const monitoring = config.monitoring ?? {};
  const scheduler = config.scheduler ?? {};
  const enableStatistics = monitoring.enabled ? "true" : "false";
  const restartInfo = escapeSqfString(String(monitoring.restartInfo ?? "服务器即将重启"));
  const serverUuid = escapeSqfString(String(config.server?.configName ?? ""));
  const commandPassword = escapeSqfString(String(config.battleye?.rconPassword ?? ""));

  let restartTime = 0;
  if (scheduler.restartCron) {
    restartTime = 360;
  }

  return [
    "if (isServer) then {",
    `\tdestiny_var_restartTime = ${restartTime};`,
    `\tdestiny_var_restartInfo = '${restartInfo}';`,
    `\tdestiny_var_serverUuid = '${serverUuid}';`,
    `\tdestiny_var_commandPassword = '${commandPassword}';`,
    `\tdestiny_var_enableStatistics = ${enableStatistics};`,
    "};",
    "",
  ].join("\r\n");
}

function escapeSqfString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

function copyFileIfChanged(source: string, target: string): void {
  if (fs.existsSync(target)) {
    const srcStat = fs.statSync(source);
    const dstStat = fs.statSync(target);
    if (srcStat.size === dstStat.size && srcStat.mtimeMs <= dstStat.mtimeMs) {
      return;
    }
  }
  fs.copyFileSync(source, target);
}

function copyDirectoryIfChanged(source: string, target: string): void {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const srcPath = path.join(source, entry.name);
    const dstPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryIfChanged(srcPath, dstPath);
      continue;
    }
    copyFileIfChanged(srcPath, dstPath);
  }
}

function writeTextIfChanged(filePath: string, content: string): void {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    if (existing === content) {
      return;
    }
  }
  fs.writeFileSync(filePath, content, "utf-8");
}
