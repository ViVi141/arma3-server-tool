import * as fs from "node:fs";
import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";
import {
  buildStartCommandLine,
  getServerExecutablePath,
  serverCfgExists,
  splitCommandLine,
} from "../config/game-config-writer.js";

export async function stopServer(app: FastifyInstance, uuid: string): Promise<void> {
  app.processManager.kill(uuid);
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
    return { success: false, message: "尚未写入 server.cfg，请先点击「写入服务器」" };
  }

  const executable = getServerExecutablePath(cfg);
  if (!fs.existsSync(executable)) {
    return { success: false, message: `可执行文件不存在: ${executable}` };
  }

  const args = splitCommandLine(buildStartCommandLine(uuid, cfg));
  app.processManager.register(uuid, {
    executable,
    args,
    cwd: serverDir,
  });
  await app.processManager.start(uuid);
  return { success: true, message: "服务器已启动" };
}

export async function restartServer(
  app: FastifyInstance,
  uuid: string
): Promise<{ success: boolean; message: string }> {
  await stopServer(app, uuid);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return startServer(app, uuid);
}

export async function detectRestartServer(
  app: FastifyInstance,
  uuid: string
): Promise<{ success: boolean; message: string }> {
  const state = app.processManager.getState(uuid);
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
  if (text === "2" || text === "stop" || text.includes("停止")) {
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
    await stopServer(app, uuid);
    return { success: true, message: "定时任务：服务器已停止" };
  }
  if (action === "start") {
    return startServer(app, uuid);
  }
  if (action === "detect") {
    return detectRestartServer(app, uuid);
  }
  return restartServer(app, uuid);
}
