import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { getConfigRoot } from "../config/game-config-writer.js";
import type { ServerConfigPackage } from "../types/config.js";
import {
  buildHeadlessClientCommandLine,
  getServerExecutablePath,
  splitCommandLine,
} from "../config/game-config-writer.js";
import { isWindows } from "../platform/index.js";
import { scanModsForConfig } from "../mods/mod-config-sync.js";
import type { FastifyInstance } from "fastify";
import { maintenanceLocks, MaintenanceLockError } from "../maintenance/locks.js";
import { loadedModPaths } from "../maintenance/scope.js";

const hcProcesses = new Map<string, ChildProcess>();

/** 仅提供候选 PID；维护仍须通过 OS 枚举、可执行路径/profile 与会话校验。 */
export function getHeadlessClientPid(uuid: string): number | undefined { return hcProcesses.get(uuid)?.pid; }
/** 仅在维护通过 OS 完整枚举确认退出后使用，不发送信号。 */
export function forgetHeadlessClient(uuid: string): void { hcProcesses.delete(uuid); }

export function startHeadlessClient(
  app: FastifyInstance,
  uuid: string,
  config: ServerConfigPackage,
  options: { replace?: boolean } = {}
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

  maintenanceLocks.assertAvailable({ instances: [uuid] });

  const executable = getServerExecutablePath(config);
  const mods = scanModsForConfig(app, config, { skipSize: true });
  let commandLine: string;
  try {
    commandLine = buildHeadlessClientCommandLine(uuid, config, mods);
    const loaded = loadedModPaths({ serverUuid: uuid, kind: "headless", workingDirectory: serverDir, args: splitCommandLine(commandLine) });
    if (!loaded.complete) maintenanceLocks.assertNoForeignWrites();
    maintenanceLocks.assertAvailable({ instances: [uuid], paths: [...loaded.paths, executable].map((value) => ({ path: path.resolve(value), mode: "read" as const })) });
    if (options.replace === false) {
      if (hcProcesses.has(uuid)) throw new Error("HC 仍有进程跟踪记录，拒绝维护启动");
    } else stopHeadlessClient(uuid);
    fs.mkdirSync(path.join(getConfigRoot(serverDir, uuid), "headless"), { recursive: true });
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
  proc.on("error", (err) => {
    if (hcProcesses.get(uuid) === proc) {
      hcProcesses.delete(uuid);
    }
    app.log?.error?.({ err, uuid }, "Headless client process error");
  });
  proc.on("exit", () => {
    if (hcProcesses.get(uuid) === proc) {
      hcProcesses.delete(uuid);
    }
  });

  return { success: true, message: `无头客户端已启动 PID ${proc.pid ?? "?"}` };
}

export function stopHeadlessClient(uuid: string): void {
  maintenanceLocks.assertAvailable({ instances: [uuid] });
  const proc = hcProcesses.get(uuid);
  if (proc && !proc.killed) {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
  }
  hcProcesses.delete(uuid);
}

export function stopAllHeadlessClients(options: { skipLocked?: boolean; preservePids?: number[] } = {}): void {
  for (const uuid of Array.from(hcProcesses.keys())) {
    if (options.preservePids?.includes(hcProcesses.get(uuid)?.pid ?? 0)) continue;
    try { stopHeadlessClient(uuid); }
    catch (error) {
      // 未解决的维护仍保留锁；Service 关闭不能绕过锁补发一次宽松 PID 停止。
      if (!(options.skipLocked && error instanceof MaintenanceLockError)) throw error;
    }
  }
}
