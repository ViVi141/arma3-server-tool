import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import type { ServerConfigPackage } from "../types/config.js";
import { buildStartCommandLine, getServerExecutablePath, splitCommandLine } from "../config/game-config-writer.js";

const hcProcesses = new Map<string, ChildProcess>();

export function startHeadlessClient(uuid: string, config: ServerConfigPackage): { success: boolean; message: string } {
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
  const args = splitCommandLine(buildStartCommandLine(uuid, config));
  args.push("-client");
  args.push("-connect=127.0.0.1:2302");

  const proc = spawn(executable, args, {
    cwd: serverDir,
    windowsHide: true,
    stdio: "ignore",
  });

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
