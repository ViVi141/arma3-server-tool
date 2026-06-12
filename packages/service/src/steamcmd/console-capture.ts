import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Readable } from "node:stream";

export interface ConsoleCaptureHandle {
  pid: number;
  kill: () => void;
  waitForExit: () => Promise<number | null>;
}

const STREAM_DRAIN_MS = 500;
const CONSOLE_LOG_POLL_MS = 400;

/**
 * Windows：弹出 SteamCMD CMD 窗口，并 tail logs/console_log.txt（与黑窗同步的官方控制台日志）。
 * 其他平台：stdout/stderr 管道。
 */
export async function spawnConsoleCapture(
  exePath: string,
  args: string[],
  cwd: string,
  onData: (chunk: string) => void,
  steamCmdInstallDir: string,
): Promise<ConsoleCaptureHandle> {
  if (process.platform === "win32") {
    return spawnWindowsCmdWindow(cwd, steamCmdInstallDir, exePath, args, onData);
  }
  return spawnPipeCapture(exePath, args, cwd, onData);
}

function spawnWindowsCmdWindow(
  cwd: string,
  installDir: string,
  exePath: string,
  args: string[],
  onData: (chunk: string) => void,
): Promise<ConsoleCaptureHandle> {
  const consoleLogPath = path.join(installDir, "logs", "console_log.txt");
  let logOffset = fileSizeOrZero(consoleLogPath);

  const argsString = args.map(arg => {
    if (arg.includes(" ") || arg.includes('"')) {
      return `"${arg.replace(/"/g, '\\"')}"`;
    }
    return arg;
  }).join(" ");

  const debugMsg = `[调试] 完整命令字符串: ${argsString}\n`;
  onData(debugMsg);

  const child = spawn(exePath, [argsString], {
    cwd,
    stdio: "ignore",
    windowsHide: true,
    detached: false,
    shell: false,
  });

  if (!child.pid) {
    return Promise.reject(new Error("无法启动 SteamCMD 进程"));
  }

  const pollTimer = setInterval(() => {
    const chunk = readNewBytes(consoleLogPath, logOffset);
    if (chunk.text) {
      logOffset = chunk.newOffset;
      onData(chunk.text);
    }
  }, CONSOLE_LOG_POLL_MS);

  let settled = false;
  let exitResolve!: (code: number | null) => void;
  const exitPromise = new Promise<number | null>((resolve) => {
    exitResolve = resolve;
  });

  const finish = (code: number | null) => {
    if (settled) {
      return;
    }
    settled = true;
    clearInterval(pollTimer);
    const tail = readNewBytes(consoleLogPath, logOffset);
    if (tail.text) {
      onData(tail.text);
    }
    exitResolve(code);
  };

  child.on("error", () => finish(1));
  child.on("exit", (code) => {
    finish(code);
  });

  return Promise.resolve({
    pid: child.pid!,
    kill: () => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    },
    waitForExit: async () => {
      const code = await exitPromise;
      await drainMs(STREAM_DRAIN_MS);
      return code;
    },
  });
}

function spawnPipeCapture(
  exePath: string,
  args: string[],
  cwd: string,
  onData: (chunk: string) => void,
): Promise<ConsoleCaptureHandle> {
  return new Promise((resolve, reject) => {
    const child = spawn(exePath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const readers: ReturnType<typeof createInterface>[] = [];

    const wire = (stream: Readable | null | undefined) => {
      if (!stream) {
        return;
      }
      const rl = createInterface({ input: stream });
      rl.on("line", (line) => onData(`${line}\n`));
      readers.push(rl);
    };
    wire(child.stdout);
    wire(child.stderr);

    let settled = false;
    let exitResolve!: (code: number | null) => void;
    const exitPromise = new Promise<number | null>((res) => {
      exitResolve = res;
    });

    child.on("error", (err) => reject(err));
    child.on("exit", (code) => {
      for (const rl of readers) {
        rl.close();
      }
      if (!settled) {
        settled = true;
        exitResolve(code);
      }
    });

    if (!child.pid) {
      reject(new Error("无法启动 SteamCMD 进程"));
      return;
    }

    resolve({
      pid: child.pid,
      kill: () => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
      },
      waitForExit: async () => {
        const code = await exitPromise;
        await drainMs(STREAM_DRAIN_MS);
        return code;
      },
    });
  });
}

function quoteCmdArg(value: string): string {
  if (!value) {
    return "\"\"";
  }
  if (!/[ \t"]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, "\\\"")}"`;
}

function fileSizeOrZero(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  return fs.statSync(filePath).size;
}

function readNewBytes(filePath: string, offset: number): { text: string; newOffset: number } {
  if (!fs.existsSync(filePath)) {
    return { text: "", newOffset: offset };
  }
  const stat = fs.statSync(filePath);
  if (stat.size <= offset) {
    return { text: "", newOffset: offset };
  }
  const length = stat.size - offset;
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, length, offset);
  } finally {
    fs.closeSync(fd);
  }
  return { text: buffer.toString("utf8"), newOffset: stat.size };
}

function drainMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
