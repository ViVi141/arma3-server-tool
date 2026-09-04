import { spawn, ChildProcess, execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { EventEmitter } from "node:events";
import type { ServerConfigPackage } from "../types/config.js";
import type { ServerProcessState } from "../types/server.js";
import { getServerExecutablePath, splitCommandLine } from "../config/game-config-writer.js";
import { isWindows } from "../platform/index.js";
import { isProcessRunning, verifyProcessIdentity } from "./identity.js";

export interface SpawnOptions {
  executable: string;
  /** Full argument string (C# ProcessStartInfo.Arguments parity). Preferred on Windows. */
  commandLine?: string;
  /** Parsed argv; used when commandLine is not set. */
  args?: string[];
  cwd: string;
}

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, ChildProcess>();
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
      const spawnOpts = {
        cwd: opts.cwd,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
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

      this.processes.set(uuid, proc);

      const logFile = path.join(opts.cwd, "logs", `server_${uuid}.log`);
      const logDir = path.dirname(logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logStream = fs.createWriteStream(logFile, { flags: "a" });

      proc.stdout?.pipe(logStream);
      proc.stderr?.pipe(logStream);

      proc.on("exit", (code) => {
        this.processes.delete(uuid);
        logStream.end();
        this.emit("exit", uuid, code);
      });

      proc.on("error", (err) => {
        this.processes.delete(uuid);
        logStream.end();
        this.emit("error", uuid, err);
      });

      resolve(proc.pid);
    });
  }

  kill(uuid: string): boolean {
    const proc = this.processes.get(uuid);
    if (!proc) return false;

    try {
      if (process.platform === "win32") {
        execSync(`taskkill /PID ${proc.pid} /T /F 2>nul`, { stdio: "ignore" });
      } else {
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
      }
    } catch {
      proc.kill();
    }

    this.processes.delete(uuid);
    return true;
  }

  getState(uuid: string, config?: ServerConfigPackage): ServerProcessState {
    const proc = this.processes.get(uuid);
    if (proc && proc.pid) {
      if (isProcessRunning(proc.pid)) {
        return { isRunning: true, pid: proc.pid };
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
          return { isRunning: true, pid: persistedPid };
        }
      }
    }

    return { isRunning: false };
  }

  getPid(uuid: string): number | undefined {
    return this.processes.get(uuid)?.pid;
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
