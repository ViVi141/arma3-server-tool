import { spawn, ChildProcess, execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { EventEmitter } from "node:events";
import type { ServerProcessState } from "../types/server.js";

export interface SpawnOptions {
  executable: string;
  args: string[];
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

  async start(uuid: string): Promise<boolean> {
    const opts = this.configs.get(uuid);
    if (!opts) return false;

    // Kill existing process if any
    this.kill(uuid);

    return new Promise((resolve) => {
      const proc = spawn(opts.executable, opts.args, {
        cwd: opts.cwd,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

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

      // Consider started when the process is spawned successfully
      resolve(true);
    });
  }

  kill(uuid: string): boolean {
    const proc = this.processes.get(uuid);
    if (!proc) return false;

    try {
      if (process.platform === "win32") {
        // On Windows, use taskkill for the process tree
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

  getState(uuid: string): ServerProcessState {
    const proc = this.processes.get(uuid);
    if (!proc || !proc.pid) {
      return { isRunning: false };
    }

    try {
      // Check if process is actually alive
      if (process.platform === "win32") {
        execSync(`tasklist /FI "PID eq ${proc.pid}" 2>nul`, {
          stdio: "pipe",
          timeout: 1000,
        });
      } else {
        process.kill(proc.pid, 0);
      }
      return { isRunning: true, pid: proc.pid };
    } catch {
      // Process is dead
      this.processes.delete(uuid);
      return { isRunning: false };
    }
  }

  getPid(uuid: string): number | undefined {
    return this.processes.get(uuid)?.pid;
  }

  isRunning(uuid: string): boolean {
    return this.getState(uuid).isRunning;
  }

  killAll(): void {
    for (const uuid of this.processes.keys()) {
      this.kill(uuid);
    }
  }
}

// Singleton
export const processManager = new ProcessManager();
