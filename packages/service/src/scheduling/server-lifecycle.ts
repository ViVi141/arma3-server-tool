import type { FastifyInstance } from "fastify";
import * as fs from "node:fs";
import type { ServerConfigPackage } from "../types/config.js";
import {
  buildStartCommandLine,
  getServerExecutablePath,
  serverCfgExists,
} from "../config/game-config-writer.js";
import { scanModsForConfig } from "../mods/mod-config-sync.js";
import {
  isProcessRunning,
  killProcessTree,
  verifyProcessIdentity,
} from "../process/identity.js";

function patchProcessId(
  app: FastifyInstance,
  uuid: string,
  pid: number
): void {
  const config = app.configStore.load(uuid);
  if (!config) {
    return;
  }
  config.tasks = {
    ...config.tasks,
    processById: pid,
  };
  app.configStore.save(uuid, config);
}

function resolveIdentityMarkers(
  uuid: string,
  config: ServerConfigPackage | null | undefined
): { profileName: string; port?: number } {
  let expectedPort = 0;
  if (config?.startup?.port && config.startup.port > 0) {
    expectedPort = config.startup.port;
  } else if (config?.basic?.port && config.basic.port > 0) {
    expectedPort = config.basic.port;
  }
  if (expectedPort > 0) {
    return { profileName: uuid, port: expectedPort };
  }
  return { profileName: uuid };
}

export async function stopServer(
  app: FastifyInstance,
  uuid: string
): Promise<{ success: boolean; message: string }> {
  const config = app.configStore.load(uuid);
  const persistedPid = config?.tasks?.processById ?? 0;
  const executable = config ? getServerExecutablePath(config) : "";
  const markers = resolveIdentityMarkers(uuid, config);

  if (app.processManager.isRunning(uuid)) {
    if (persistedPid > 0 && executable) {
      const identity = verifyProcessIdentity(persistedPid, executable, markers);
      if (identity === "mismatch") {
        return {
          success: false,
          message: `检测到 PID=${persistedPid} 对应进程不是当前服务器进程，已取消停止以避免误杀。`,
        };
      }
      if (identity === "unknown") {
        return {
          success: false,
          message: `无法验证 PID=${persistedPid} 的进程身份，已取消停止以避免误杀。`,
        };
      }
    }
    app.processManager.kill(uuid);
    patchProcessId(app, uuid, 0);
    return { success: true, message: "服务器已停止" };
  }

  if (persistedPid > 0 && isProcessRunning(persistedPid)) {
    if (executable) {
      const identity = verifyProcessIdentity(persistedPid, executable, markers);
      if (identity === "mismatch") {
        return {
          success: false,
          message: `检测到 PID=${persistedPid} 对应进程不是当前服务器进程，已取消停止以避免误杀。`,
        };
      }
      if (identity === "unknown") {
        return {
          success: false,
          message: `无法验证 PID=${persistedPid} 的进程身份，已取消停止以避免误杀。`,
        };
      }
    }
    killProcessTree(persistedPid);
  }

  patchProcessId(app, uuid, 0);
  return { success: true, message: "服务器已停止" };
}

export async function startServer(
  app: FastifyInstance,
  uuid: string,
  config?: ServerConfigPackage | null
): Promise<{ success: boolean; message: string }> {
  const cfg = config ?? app.configStore.load(uuid);
  if (!cfg) {
    return { success: false, message: "未找到服务器配置" };
  }

  const serverDir = cfg.server?.serverDir;
  if (!serverDir) {
    return { success: false, message: "未设置服务器目录" };
  }
  if (!serverCfgExists(serverDir, uuid)) {
    return { success: false, message: "尚未写入 server.cfg，请先点击「写入游戏配置」" };
  }

  const executable = getServerExecutablePath(cfg);
  if (!fs.existsSync(executable)) {
    return { success: false, message: `可执行文件不存在: ${executable}` };
  }

  let commandLine: string;
  try {
    const mods = scanModsForConfig(app, cfg);
    commandLine = buildStartCommandLine(uuid, cfg, mods);
  } catch (error) {
    const message = error instanceof Error ? error.message : "构建启动命令行失败";
    return { success: false, message };
  }

  app.processManager.register(uuid, {
    executable,
    commandLine,
    cwd: serverDir,
  });

  const pid = await app.processManager.start(uuid);
  if (!pid) {
    patchProcessId(app, uuid, 0);
    return { success: false, message: "启动失败：未能创建进程" };
  }

  if (!isProcessRunning(pid)) {
    patchProcessId(app, uuid, 0);
    return { success: false, message: "进程已退出" };
  }

  patchProcessId(app, uuid, pid);

  await new Promise((resolve) => setTimeout(resolve, 2000));
  if (!isProcessRunning(pid)) {
    app.processManager.kill(uuid);
    patchProcessId(app, uuid, 0);
    return { success: false, message: "进程启动后2秒内已退出，请检查模板/模组配置。" };
  }

  return { success: true, message: "服务器已启动" };
}

export async function restartServer(
  app: FastifyInstance,
  uuid: string
): Promise<{ success: boolean; message: string }> {
  const stopResult = await stopServer(app, uuid);
  if (!stopResult.success) {
    return stopResult;
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return startServer(app, uuid);
}

export async function detectRestartServer(
  app: FastifyInstance,
  uuid: string
): Promise<{ success: boolean; message: string }> {
  const config = app.configStore.load(uuid);
  const state = app.processManager.getState(uuid, config ?? undefined);
  if (state.isRunning) {
    return { success: true, message: "服务器已在运行" };
  }
  return startServer(app, uuid);
}

export function resolveCronAction(actionText: string): "restart" | "start" | "stop" | "detect" {
  const text = actionText.trim().toLowerCase();
  if (text === "1" || text.includes("start") || text.includes("启动")) {
    return "start";
  }
  if (text === "2" || text.includes("stop") || text.includes("停止")) {
    return "stop";
  }
  if (text === "3" || text.includes("detect") || text.includes("检测")) {
    return "detect";
  }
  return "restart";
}

export async function executeCronAction(
  app: FastifyInstance,
  uuid: string,
  actionText: string
): Promise<{ success: boolean; message: string }> {
  const action = resolveCronAction(actionText);
  if (action === "stop") {
    return stopServer(app, uuid);
  }
  if (action === "start") {
    return startServer(app, uuid);
  }
  if (action === "detect") {
    return detectRestartServer(app, uuid);
  }
  return restartServer(app, uuid);
}
