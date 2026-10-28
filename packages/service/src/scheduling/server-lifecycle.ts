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
  commandLineMatchesMarkers,
  isProcessRunning,
  killProcessTree,
  verifyProcessIdentity,
} from "../process/identity.js";
import { waitForPortReady } from "../process/port-check.js";

/** Max seconds to wait for the game port to start listening after spawn. */
const PORT_READY_TIMEOUT_MS = 45_000;

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
  const port = resolveGamePort(config);
  if (port > 0) {
    return { profileName: uuid, port };
  }
  return { profileName: uuid };
}

function resolveGamePort(config: ServerConfigPackage | null | undefined): number {
  if (config?.startup?.port && config.startup.port > 0) {
    return config.startup.port;
  }
  if (config?.basic?.port && config.basic.port > 0) {
    return config.basic.port;
  }
  return 0;
}

export async function stopServer(
  app: FastifyInstance,
  uuid: string
): Promise<{ success: boolean; message: string }> {
  const config = app.configStore.load(uuid);
  const persistedPid = config?.tasks?.processById ?? 0;
  const executable = config ? getServerExecutablePath(config) : "";
  const markers = resolveIdentityMarkers(uuid, config);
  const runningPid = app.processManager.getPid(uuid) ?? (persistedPid > 0 && isProcessRunning(persistedPid) ? persistedPid : 0);

  if (runningPid <= 0) {
    patchProcessId(app, uuid, 0);
    return { success: true, message: "服务器已停止" };
  }

  let identity: "match" | "mismatch" | "unknown" = "unknown";
  if (executable) {
    identity = verifyProcessIdentity(runningPid, executable, markers);
  }
  if (identity === "mismatch") {
    // PID 已被其他进程复用：不是我们的服务器，只清理记录，绝不杀进程。
    patchProcessId(app, uuid, 0);
    app.processManager.forget(uuid);
    return {
      success: true,
      message: `PID=${runningPid} 已不是本服务器进程（PID 被复用），已清除记录，未执行停止。`,
    };
  }
  if (identity === "unknown") {
    // 完整校验不可行时降级为命令行 `-name=<uuid>` 精确匹配，而不是直接拒绝停止。
    const nameMatch = commandLineMatchesMarkers(runningPid, uuid);
    if (nameMatch === false) {
      patchProcessId(app, uuid, 0);
      app.processManager.forget(uuid);
      return {
        success: true,
        message: `PID=${runningPid} 的命令行不含本服务器标识，已清除记录，未执行停止。`,
      };
    }
    if (nameMatch === null) {
      return {
        success: false,
        message: `无法读取 PID=${runningPid} 的命令行以确认进程身份，为避免误杀已取消停止。请手动确认该进程后在任务管理器中处理，或重新「启动」以接管。`,
      };
    }
    // nameMatch === true：确属本服务器，放行到下面的精确 PID 终止。
  }

  // 仅针对确认身份的 PID 执行树终止（不依赖 processManager 内存句柄，
  // 服务重启后收养的孤儿进程同样可以被停止）。
  killProcessTree(runningPid);
  app.processManager.forget(uuid);
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

  // 防双实例：若已有本服务器的存活进程（含服务重启后遗留的孤儿），直接收养，
  // 绝不重复 spawn，避免同端口/同配置文件双实例互相“串台”。
  const state = app.processManager.getState(uuid, cfg);
  if (state.isRunning && state.pid) {
    app.processManager.adopt(uuid, state.pid);
    patchProcessId(app, uuid, state.pid);
    return { success: true, message: `服务器已在运行（PID=${state.pid}，已接管）` };
  }

  let commandLine: string;
  try {
    const mods = scanModsForConfig(app, cfg);
    commandLine = buildStartCommandLine(uuid, cfg, mods);
  } catch (error) {
    const message = error instanceof Error ? error.message : "构建启动命令行失败";
    return { success: false, message };
  }

  // 默认显示服务器窗口：报错/断言对话框需要人工确认，窗口隐藏时会被永久卡住。
  // 如需无窗口运行（如杂项后台部署），在启动参数中开启 showServerWindow=false。
  app.processManager.register(uuid, {
    executable,
    commandLine,
    cwd: serverDir,
    windowsHide: cfg.startup?.showServerWindow === false,
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

  const port = resolveGamePort(cfg);
  if (port <= 0) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!isProcessRunning(pid)) {
      app.processManager.kill(uuid);
      patchProcessId(app, uuid, 0);
      return { success: false, message: "进程启动后2秒内已退出，请检查模板/模组配置。" };
    }
    return { success: true, message: "服务器已启动（未配置端口，无法探测就绪状态）" };
  }

  const readiness = await waitForPortReady(port, PORT_READY_TIMEOUT_MS, () =>
    isProcessRunning(pid)
  );

  if (readiness === "exited") {
    app.processManager.kill(uuid);
    patchProcessId(app, uuid, 0);
    return {
      success: false,
      message: `进程启动后已退出（端口 ${port} 从未监听），请检查模板/模组配置或 RPT 日志。`,
    };
  }

  if (readiness === "timeout") {
    const visible = cfg.startup?.showServerWindow !== false;
    return {
      success: true,
      message: visible
        ? `进程运行中（PID=${pid}），但端口 ${port} 在 ${PORT_READY_TIMEOUT_MS / 1000}s 内未监听——请查看服务器窗口是否有报错弹窗需要确认。`
        : `进程运行中（PID=${pid}），但端口 ${port} 在 ${PORT_READY_TIMEOUT_MS / 1000}s 内未监听。当前为隐藏窗口模式：若服务器弹出错误对话框将无法看到并卡住启动，建议开启“显示服务器窗口”后重试。`,
    };
  }

  return { success: true, message: `服务器已启动并就绪（端口 ${port}）` };
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
  if (state.isRunning && state.pid) {
    app.processManager.adopt(uuid, state.pid);
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
