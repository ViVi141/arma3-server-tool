import * as fs from "node:fs";
import * as path from "node:path";
import { getServerKeysDirectory } from "../mods/bikey-service.js";
import { execSync } from "node:child_process";
import type { ServerConfigPackage } from "../types/config.js";
import {
  getServerExecutablePath,
  serverCfgExists,
} from "../config/game-config-writer.js";
import type { ModMeta } from "../types/mods.js";

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
      const output = execSync("netstat -an -p udp", { encoding: "utf-8", stdio: "pipe" });
      const needle = `:${port} `;
      return output.includes(needle);
    } catch {
      return false;
    }
  }

  if (process.platform === "linux") {
    try {
      const output = execSync("ss -uln", { encoding: "utf-8", stdio: "pipe", timeout: 3000 });
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
    let notCopied = 0;
    let noKey = 0;
    let unsigned = 0;
    for (const mod of failed) {
      if (mod.bikeyStatus === "not_copied") {
        notCopied += 1;
      } else if (mod.bikeyStatus === "no_key") {
        noKey += 1;
      } else if (mod.bikeyStatus === "unsigned") {
        unsigned += 1;
      }
    }
    const parts: string[] = [];
    if (notCopied > 0) {
      parts.push(`${notCopied} 个未复制 key`);
    }
    if (noKey > 0) {
      parts.push(`${noKey} 个缺少 key`);
    }
    if (unsigned > 0) {
      parts.push(`${unsigned} 个缺少 bisign`);
    }
    issues.push({
      category: "Bikey",
      severity: "warning",
      message: `${failed.length} 个已启用模组未通过 Bikey 验证（须同时具备 bisign、key 且已复制）${parts.length ? `：${parts.join("，")}` : ""}`,
    });
  }

  return {
    issues,
    hasBlockingErrors: issues.some((i) => i.severity === "error"),
  };
}
