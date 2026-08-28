import { spawn, type ChildProcess } from "node:child_process";
import type { ServerConfigPackage } from "../types/config.js";
import {
  buildHeadlessClientCommandLine,
  getServerExecutablePath,
  splitCommandLine,
} from "../config/game-config-writer.js";
import { isWindows } from "../platform/index.js";
import { scanModsForConfig } from "../mods/mod-config-sync.js";
import type { FastifyInstance } from "fastify";

const hcProcesses = new Map<string, ChildProcess>();

export function startHeadlessClient(
  app: FastifyInstance,
  uuid: string,
  config: ServerConfigPackage
): { success: boolean; message: string } {
  const basic = (config.basic ?? {}) as Record<string, unknown>;
  const tasks = (config.tasks ?? {}) as Record<string, unknown>;
  const enableHc = tasks.enableHeadlessClient ?? basic.enableHeadlessClient;
  if (!enableHc) {
    return { success: false, message: "未启用无头客户端" };
  }

  const serverDir = config.server?.serverDir;
  if (!serverDir) {
    return { success: false, message: "未设置服务器目录" };
  }

  stopHeadlessClient(uuid);

  const executable = getServerExecutablePath(config);
  const mods = scanModsForConfig(app, config);
  let commandLine: string;
  try {
    commandLine = buildHeadlessClientCommandLine(uuid, config, mods);
  } catch (error) {
    const message = error instanceof Error ? error.message : "构建无头客户端命令行失败";
    return { success: false, message };
  }

  const spawnOpts = {
    cwd: serverDir,
    windowsHide: true,
    stdio: "ignore" as const,
  };

  let proc: ChildProcess;
  if (isWindows()) {
    proc = spawn(executable, [commandLine], {
      ...spawnOpts,
      windowsVerbatimArguments: true,
    });
  } else {
    proc = spawn(executable, splitCommandLine(commandLine), spawnOpts);
  }

  hcProcesses.set(uuid, proc);
  proc.on("exit", () => {
    hcProcesses.delete(uuid);
  });

  return { success: true, message: `无头客户端已启动 PID ${proc.pid ?? "?"}` };
}

export function stopHeadlessClient(uuid: string): void {
  const proc = hcProcesses.get(uuid);
  if (proc && !proc.killed) {
    proc.kill();
  }
  hcProcesses.delete(uuid);
}
