import { spawn, ChildProcess, execFileSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { EventEmitter } from "node:events";
import { maintenanceLocks } from "../maintenance/locks.js";
import { loadedModPaths } from "../maintenance/scope.js";
import type { ServerConfigPackage } from "../types/config.js";
import type { ServerProcessState } from "../types/server.js";
import { isWindows } from "../platform/index.js";
import {
  invalidateProcessIdentityCache,
  isProcessRunning,
  isProcessRunningAsync,
  isValidPid,
  verifyProcessIdentityAsync,
} from "./identity.js";
import { getServerExecutablePath, splitCommandLine } from "../config/game-config-writer.js";

export interface SpawnOptions {
  executable: string;
  /** Full argument string (C# ProcessStartInfo.Arguments parity). Preferred on Windows. */
  commandLine?: string;
  /** Parsed argv; used when commandLine is not set. */
  args?: string[];
  cwd: string;
  /**
   * Hidden by default (legacy behavior). Set false on Windows to keep the
   * dedicated server's own console window visible — required for operators to
   * see in-game error/assert dialogs that block startup until confirmed.
   */
  windowsHide?: boolean;
}

/** Minimal tracked entry: real spawn handles carry the ChildProcess, adopted ones only the PID. */
interface ProcessEntry {
  pid: number;
  child?: ChildProcess;
}

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, ProcessEntry>();
  private configs = new Map<string, SpawnOptions>();

  register(uuid: string, options: SpawnOptions): void {
    this.configs.set(uuid, options);
  }

  unregister(uuid: string): void {
    this.configs.delete(uuid);
    this.kill(uuid);
  }

  async start(uuid: string, options: { replace?: boolean } = {}): Promise<number | undefined> {
    const opts = this.configs.get(uuid);
    if (!opts) {
      return undefined;
    }

    const loaded = loadedModPaths({ serverUuid: uuid, kind: "server", workingDirectory: opts.cwd, args: opts.commandLine !== undefined ? splitCommandLine(opts.commandLine) : (opts.args ?? []) });
    if (!loaded.complete) maintenanceLocks.assertNoForeignWrites();
    maintenanceLocks.assertAvailable({ instances: [uuid], paths: [...loaded.paths, path.resolve(opts.cwd, opts.executable)].map((value) => ({ path: value, mode: "read" as const })) });
    // 维护恢复已由 OS 会话核对停止；此路径不能顺带终止任何跟踪中的进程。
    if (options.replace === false) {
      if (this.processes.has(uuid)) throw new Error("实例仍有进程跟踪记录，拒绝维护启动");
    } else this.kill(uuid);

    return new Promise((resolve) => {
      // Windows 上重定向 stdout/stderr 会导致专用服务器不再写入 logFile（server_console.log），
      // 只剩 RPT。Linux 专用服则以 stdout 为主，保留管道捕获。
      // 需要显示服务器窗口时，stdio 必须为 ignore：带管道的 stdio 会阻止新建控制台。
      // 注意：Service 由 Electron 以「无控制台」方式拉起（windowsHide:true + stdio 重定向），
      // 子进程无从继承控制台，单靠 windowsHide:false 并不会凭空创建一个窗口——
      // 必须 detached:true 触发 CREATE_NEW_CONSOLE，才等效于 .bat 里用 start 打开服务器窗口。
      const showServerWindow = isWindows() && opts.windowsHide === false;
      const stdio: ["ignore", "pipe" | "ignore", "pipe" | "ignore"] = isWindows()
        ? ["ignore", "ignore", "ignore"]
        : ["ignore", "pipe", "pipe"];

      const spawnOpts = {
        cwd: opts.cwd,
        windowsHide: opts.windowsHide ?? true,
        stdio,
        detached: showServerWindow,
      };

      let proc: ChildProcess;
      if (opts.commandLine !== undefined) {
        if (isWindows()) {
          proc = spawn(opts.executable, [opts.commandLine], {
            ...spawnOpts,
            windowsVerbatimArguments: true,
          });
        } else {
          proc = spawn(opts.executable, splitCommandLine(opts.commandLine), spawnOpts);
        }
      } else {
        proc = spawn(opts.executable, opts.args ?? [], spawnOpts);
      }

      // 分离出的服务器窗口应独立于 Service 进程树存活；解除引用以免阻塞 Service 退出。
      // 停止仍通过持久化 PID + killProcessTree(taskkill /T) 精确处理，不依赖此句柄。
      if (showServerWindow) {
        proc.unref();
      }

      this.processes.set(uuid, { pid: proc.pid ?? 0, child: proc });

      const logFile = path.join(opts.cwd, "logs", `server_${uuid}.log`);
      const logDir = path.dirname(logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      let logStream: fs.WriteStream | null = null;
      if (!isWindows()) {
        logStream = fs.createWriteStream(logFile, { flags: "a" });
        proc.stdout?.pipe(logStream);
        proc.stderr?.pipe(logStream);
      }

      proc.on("exit", (code) => {
        if (this.processes.get(uuid)?.child === proc) this.processes.delete(uuid);
        logStream?.end();
        this.emit("exit", uuid, code);
      });

      proc.on("error", (err) => {
        if (this.processes.get(uuid)?.child === proc) this.processes.delete(uuid);
        logStream?.end();
        // 不能使用 "error" 事件名：EventEmitter 在无监听者时会直接抛出，
        // 一次 spawn 失败就会拖垮整个 Service。改为普通事件，由 index.ts 兜底记录。
        this.emit("spawn-error", uuid, err);
      });

      resolve(proc.pid);
    });
  }

  /**
   * Re-attach a known-running PID (e.g. persisted in config.tasks.processById
   * before a service restart) so stop/kill no longer silently no-ops.
   */
  adopt(uuid: string, pid: number): boolean {
    if (!isValidPid(pid) || !isProcessRunning(pid)) {
      return false;
    }
    const existing = this.processes.get(uuid);
    if (existing?.pid === pid) {
      return true;
    }
    if (existing && isValidPid(existing.pid) && isProcessRunning(existing.pid)) {
      return false;
    }
    this.processes.set(uuid, { pid });
    this.emit("adopt", uuid, pid);
    return true;
  }

  /** Drop tracking for a uuid without touching the OS process (e.g. PID was reused by another program). */
  forget(uuid: string): void {
    this.processes.delete(uuid);
  }

  kill(uuid: string): boolean {
    const entry = this.processes.get(uuid);
    if (!entry) return false;

    const pid = entry.child?.pid ?? entry.pid;
    try {
      if (!isValidPid(pid)) {
        entry.child?.kill();
      } else if (isWindows()) {
        execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
          stdio: "ignore",
          timeout: 5000,
          windowsHide: true,
        });
      } else if (entry.child) {
        entry.child.kill("SIGTERM");
        const child = entry.child;
        const timer = setTimeout(() => {
          // child.killed 只表示 kill() 调用过，不代表进程已退出；
          // 必须看 exitCode/signalCode，否则升级 SIGKILL 永远不会发生。
          if (child.exitCode === null && child.signalCode === null) {
            try {
              child.kill("SIGKILL");
            } catch {
              // already dead
            }
          }
        }, 5000);
        timer.unref?.();
      } else {
        process.kill(pid, "SIGTERM");
      }
    } catch {
      try {
        entry.child?.kill();
      } catch {
        // already dead
      }
    }
    if (isValidPid(pid)) {
      invalidateProcessIdentityCache(pid);
    }

    // For adopted entries (no child) there is no exit event; drop the record here.
    if (!entry.child) {
      this.processes.delete(uuid);
    }
    return true;
  }

  /**
   * 查询服务器进程状态。
   * 必须使用异步身份校验：Windows 下每次校验都会拉起 PowerShell，
   * 同步调用会在状态接口轮询时阻塞整个事件循环数十毫秒到数秒。
   */
  async getState(uuid: string, config?: ServerConfigPackage): Promise<ServerProcessState> {
    const entry = this.processes.get(uuid);
    if (entry && isValidPid(entry.pid)) {
      if (await isProcessRunningAsync(entry.pid)) {
        return { isRunning: true, pid: entry.pid };
      }
      this.processes.delete(uuid);
    }

    const persistedPid = config?.tasks?.processById ?? 0;
    if (isValidPid(persistedPid) && (await isProcessRunningAsync(persistedPid))) {
      if (config?.server?.serverDir) {
        const executable = getServerExecutablePath(config);
        let expectedPort = 0;
        if (config.startup?.port && config.startup.port > 0) {
          expectedPort = config.startup.port;
        } else if (config.basic?.port && config.basic.port > 0) {
          expectedPort = config.basic.port;
        }
        const identity = await verifyProcessIdentityAsync(persistedPid, executable, {
          profileName: uuid,
          port: expectedPort > 0 ? expectedPort : undefined,
        });
        if (identity === "match") {
          // Re-attach so subsequent kill/stop actually reaches the process.
          this.processes.set(uuid, { pid: persistedPid });
          this.emit("adopt", uuid, persistedPid);
          return { isRunning: true, pid: persistedPid };
        }
      }
    }

    return { isRunning: false };
  }

  getPid(uuid: string): number | undefined {
    const pid = this.processes.get(uuid)?.pid;
    return pid && pid > 0 ? pid : undefined;
  }

  async isRunning(uuid: string, config?: ServerConfigPackage): Promise<boolean> {
    return (await this.getState(uuid, config)).isRunning;
  }

  killAll(): void {
    for (const uuid of this.processes.keys()) {
      this.kill(uuid);
    }
  }
}

export const processManager = new ProcessManager();
