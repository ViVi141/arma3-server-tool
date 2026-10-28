import { spawn, ChildProcess, execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { EventEmitter } from "node:events";
import type { ServerConfigPackage } from "../types/config.js";
import type { ServerProcessState } from "../types/server.js";
import { isWindows } from "../platform/index.js";
import { isProcessRunning, verifyProcessIdentity } from "./identity.js";
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

  async start(uuid: string): Promise<number | undefined> {
    const opts = this.configs.get(uuid);
    if (!opts) {
      return undefined;
    }

    this.kill(uuid);

    return new Promise((resolve) => {
      // Windows 上重定向 stdout/stderr 会导致专用服务器不再写入 logFile（server_console.log），
      // 只剩 RPT。Linux 专用服则以 stdout 为主，保留管道捕获。
      const stdio: ["ignore", "pipe" | "ignore", "pipe" | "ignore"] = isWindows()
        ? ["ignore", "ignore", "ignore"]
        : ["ignore", "pipe", "pipe"];

      const spawnOpts = {
        cwd: opts.cwd,
        windowsHide: opts.windowsHide ?? true,
        stdio,
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
        this.processes.delete(uuid);
        logStream?.end();
        this.emit("exit", uuid, code);
      });

      proc.on("error", (err) => {
        this.processes.delete(uuid);
        logStream?.end();
        this.emit("error", uuid, err);
      });

      resolve(proc.pid);
    });
  }

  /**
   * Re-attach a known-running PID (e.g. persisted in config.tasks.processById
   * before a service restart) so stop/kill no longer silently no-ops.
   */
  adopt(uuid: string, pid: number): boolean {
    if (!pid || pid <= 0 || !isProcessRunning(pid)) {
      return false;
    }
    const existing = this.processes.get(uuid);
    if (existing?.pid === pid) {
      return true;
    }
    if (existing && existing.pid > 0 && isProcessRunning(existing.pid)) {
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
      if (isWindows()) {
        execSync(`taskkill /PID ${pid} /T /F 2>nul`, { stdio: "ignore" });
      } else if (entry.child) {
        entry.child.kill("SIGTERM");
        const child = entry.child;
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 5000);
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

    // For adopted entries (no child) there is no exit event; drop the record here.
    if (!entry.child) {
      this.processes.delete(uuid);
    }
    return true;
  }

  getState(uuid: string, config?: ServerConfigPackage): ServerProcessState {
    const entry = this.processes.get(uuid);
    if (entry && entry.pid > 0) {
      if (isProcessRunning(entry.pid)) {
        return { isRunning: true, pid: entry.pid };
      }
      this.processes.delete(uuid);
    }

    const persistedPid = config?.tasks?.processById ?? 0;
    if (persistedPid > 0 && isProcessRunning(persistedPid)) {
      if (config?.server?.serverDir) {
        const executable = getServerExecutablePath(config);
        let expectedPort = 0;
        if (config.startup?.port && config.startup.port > 0) {
          expectedPort = config.startup.port;
        } else if (config.basic?.port && config.basic.port > 0) {
          expectedPort = config.basic.port;
        }
        const identity = verifyProcessIdentity(persistedPid, executable, {
          profileName: uuid,
          port: expectedPort > 0 ? expectedPort : undefined,
        });
        if (identity === "match") {
          // Re-attach so subsequent kill/stop actually reaches the process.
          this.adopt(uuid, persistedPid);
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

  isRunning(uuid: string, config?: ServerConfigPackage): boolean {
    return this.getState(uuid, config).isRunning;
  }

  killAll(): void {
    for (const uuid of this.processes.keys()) {
      this.kill(uuid);
    }
  }
}

export const processManager = new ProcessManager();
