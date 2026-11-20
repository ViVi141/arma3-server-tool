import * as fs from "node:fs";
import * as path from "node:path";
import { getServerKeysDirectory } from "../mods/bikey-service.js";
import { execFileSync } from "node:child_process";
import type { ServerConfigPackage } from "../types/config.js";
import {
  ensureProfileRoot,
  getServerExecutablePath,
  serverCfgExists,
} from "../config/game-config-writer.js";
import { resolveEffectiveRconPort } from "../config/rcon-port.js";
import type { ModMeta } from "../types/mods.js";
import { healthConfigurationIssues } from "../health/configuration.js";
import { healthModMatches } from "../health/mod.js";
import { getConfigRoot } from "../config/game-config-writer.js";

export interface PreflightIssue {
  category: string;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface PreflightResult {
  issues: PreflightIssue[];
  hasBlockingErrors: boolean;
}

export function isUdpPortInUse(port: number): boolean {
  if (port <= 0 || port > 65535) {
    return false;
  }

  if (process.platform === "win32") {
    try {
      const output = execFileSync("netstat", ["-an", "-p", "udp"], { encoding: "utf-8", stdio: "pipe" });
      const needle = `:${port} `;
      return output.includes(needle);
    } catch {
      return false;
    }
  }

  if (process.platform === "linux") {
    try {
      const output = execFileSync("ss", ["-uln"], { encoding: "utf-8", stdio: "pipe", timeout: 3000 });
      return output.includes(`:${port} `);
    } catch {
      return false;
    }
  }

  return false;
}

export function runPreflightChecks(
  uuid: string,
  config: ServerConfigPackage,
  options?: {
    isRunning?: boolean;
    scannedMods?: ModMeta[];
  }
): PreflightResult {
  const issues: PreflightIssue[] = [];
  const serverDir = config.server?.serverDir?.trim() ?? "";
  const startup = config.startup ?? {};
  const basic = config.basic ?? {};
  const port = startup.port ?? basic.port ?? 2302;

  if (!serverDir) {
    issues.push({
      category: "目录",
      severity: "error",
      message: "未设置服务器目录",
    });
  } else if (!fs.existsSync(serverDir)) {
    issues.push({
      category: "目录",
      severity: "error",
      message: "服务器目录不存在",
    });
  } else if (!serverCfgExists(serverDir, uuid)) {
    issues.push({
      category: "配置",
      severity: "error",
      message: "尚未写入 server.cfg，请先点击「写入服务器」",
    });
  }

  const executable = getServerExecutablePath(config);
  if (!config.server?.executable) {
    issues.push({
      category: "配置",
      severity: "error",
      message: "未设置可执行文件",
    });
  } else if (serverDir && !fs.existsSync(executable)) {
    issues.push({
      category: "可执行文件",
      severity: "error",
      message: `找不到服务器程序: ${executable}`,
    });
  }

  if (port <= 0 || port > 65535) {
    issues.push({
      category: "网络",
      severity: "error",
      message: `游戏端口无效: ${port}`,
    });
  } else if (!options?.isRunning && isUdpPortInUse(port)) {
    issues.push({
      category: "网络",
      severity: "warning",
      message: `UDP ${port} 已被占用，可能与其他程序冲突`,
    });
  } else if (options?.isRunning) {
    issues.push({
      category: "网络",
      severity: "info",
      message: `服务器已在运行 (UDP ${port})`,
    });
  }

  // 日志：RPT 是否还能生成（-noLogs / profile 目录不可写都会导致“日志页空白”）
  const noLogsOn = basic.noLogs === true || basic.noLogs === 1 || basic.noLogs === "1";
  if (noLogsOn) {
    issues.push({
      category: "日志",
      severity: "warning",
      message: "已开启 -noLogs：服务器不会生成 RPT，日志页将没有内容",
    });
  } else if (serverDir) {
    try {
      const profileRoot = ensureProfileRoot(serverDir, uuid);
      fs.accessSync(profileRoot, fs.constants.W_OK);
      issues.push({
        category: "日志",
        severity: "info",
        message: `RPT 将写入 ${profileRoot}`,
      });
    } catch (error) {
      issues.push({
        category: "日志",
        severity: "error",
        message: `profile 目录不可写，RPT 可能无法生成：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const hostname = String(basic.hostname ?? "").trim();
  if (!hostname) {
    issues.push({
      category: "基本",
      severity: "warning",
      message: "未设置主机名",
    });
  }

  const maxPlayers = basic.maxPlayers;
  if (maxPlayers != null && (maxPlayers < 1 || maxPlayers > 200)) {
    issues.push({
      category: "基本",
      severity: "warning",
      message: "最大玩家数异常（建议 2–200）",
    });
  }

  if (!config.battleye?.rconPassword) {
    issues.push({
      category: "RCon",
      severity: "warning",
      message: "未配置 RCon 密码，远程控制与在线人数统计不可用",
    });
  } else {
    const configuredRconPort = Number(config.battleye?.rconPort);
    const effectiveRconPort = resolveEffectiveRconPort(config);
    if (Number.isFinite(configuredRconPort) && configuredRconPort === port) {
      issues.push({
        category: "RCon",
        severity: "warning",
        message: `RCon 端口不能与游戏端口相同（BattlEye 要求独立端口），实际使用 ${effectiveRconPort}`,
      });
    }
    if (!options?.isRunning && isUdpPortInUse(effectiveRconPort)) {
      issues.push({
        category: "RCon",
        severity: "warning",
        message: `UDP ${effectiveRconPort} 已被占用，BattlEye RCon 可能无法监听`,
      });
    }
  }

  const keysDir = serverDir ? getServerKeysDirectory(serverDir) : "";
  if (keysDir && !fs.existsSync(keysDir)) {
    issues.push({
      category: "Bikey",
      severity: "info",
      message: "服务器 keys 目录不存在，复制 Bikey 时将自动创建",
    });
  }

  const mods = options?.scannedMods ?? [];
  const enabled = mods.filter((m) => m.enabled);
  const failed = enabled.filter((m) => m.bikeyStatus !== "ready");
  if (failed.length > 0) {
    const counts = new Map<string, number>();
    for (const mod of failed) {
      const label = mod.bikeyLabel ?? "未检查";
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    issues.push({
      category: "Bikey",
      severity: "warning",
      message: `${failed.length} 个已启用模组文件检查待处理：${[...counts].map(([label, count]) => `${label} ${count}`).join("，")}。仅服模／HC 缺签名不等同于玩家入服阻断；此检查不是密码学验证。`,
    });
  }

  if (config.health?.enabled || config.health?.unattended) {
    for (const message of healthConfigurationIssues(config)) {
      issues.push({ category: "无人运行与健康", severity: "warning", message });
    }
    if (config.health.enabled && serverDir && !healthModMatches(getConfigRoot(serverDir, uuid))) {
      issues.push({ category: "无人运行与健康", severity: "warning", message: "独立健康模组未部署或内容不一致，请先应用更改。" });
    }
    issues.push({ category: "无人运行与健康", severity: "info", message: "健康需进程存活、RCon 响应与连续两条递增任务心跳；公网可达性和真实玩家加入尚未验证。" });
  }

  return {
    issues,
    hasBlockingErrors: issues.some((i) => i.severity === "error"),
  };
}
