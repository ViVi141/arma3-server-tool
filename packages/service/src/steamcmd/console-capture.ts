import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Readable } from "node:stream";
import { isWindows } from "../platform/index.js";
import { splitCommandLine } from "../platform/argv.js";
import { redactPasswordInArguments } from "./arguments.js";

export interface ConsoleCaptureHandle {
  pid: number;
  kill: () => void;
  waitForExit: () => Promise<number | null>;
}

export interface ConsoleCaptureOptions {
  password?: string;
}

const STREAM_DRAIN_MS = 500;
const CONSOLE_LOG_POLL_MS = 400;

/**
 * Run SteamCMD with ProcessStartInfo.Arguments-compatible command tail (legacy C# parity).
 * Windows: windowsVerbatimArguments passes the string without re-quoting.
 */
export async function spawnConsoleCapture(
  exePath: string,
  argumentsString: string,
  cwd: string,
  onData: (chunk: string) => void,
  steamCmdInstallDir: string,
  options?: ConsoleCaptureOptions,
): Promise<ConsoleCaptureHandle> {
  if (isWindows()) {
    return spawnWindowsCaptured(
      exePath,
      argumentsString,
      cwd,
      steamCmdInstallDir,
      onData,
      options,
    );
  }
  return spawnPipeCapture(exePath, argumentsString, cwd, onData);
}

function spawnWindowsCaptured(
  exePath: string,
  argumentsString: string,
  cwd: string,
  installDir: string,
  onData: (chunk: string) => void,
  options?: ConsoleCaptureOptions,
): Promise<ConsoleCaptureHandle> {
  const consoleLogPath = path.join(installDir, "logs", "console_log.txt");
  let logOffset = fileSizeOrZero(consoleLogPath);

  const safeArgs = redactPasswordInArguments(argumentsString, options?.password);
  const debugMsg = `[调试] ProcessStartInfo.Arguments: ${safeArgs}\n`;
  onData(debugMsg);

  const child = spawn(exePath, [argumentsString], {
    cwd,
    stdio: "ignore",
    windowsHide: true,
    detached: false,
    shell: false,
    windowsVerbatimArguments: true,
  });

  let settled = false;
  let exitResolve!: (code: number | null) => void;
  const exitPromise = new Promise<number | null>((resolve) => {
    exitResolve = resolve;
  });
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const finish = (code: number | null) => {
    if (settled) {
      return;
    }
    settled = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    const tail = readNewBytes(consoleLogPath, logOffset);
    if (tail.text) {
      logOffset = tail.newOffset;
      onData(tail.text);
    }
    exitResolve(code);
  };

  // Attach error listener before checking !child.pid so immediate ENOENT never throws unhandled 'error'.
  child.on("error", () => finish(1));
  child.on("exit", (code) => {
    finish(code);
  });

  if (!child.pid) {
    finish(1);
    return Promise.reject(new Error("无法启动 SteamCMD 进程"));
  }

  pollTimer = setInterval(() => {
    const chunk = readNewBytes(consoleLogPath, logOffset);
    if (chunk.text) {
      logOffset = chunk.newOffset;
      onData(chunk.text);
    } else if (chunk.newOffset !== logOffset) {
      logOffset = chunk.newOffset;
    }
  }, CONSOLE_LOG_POLL_MS);

  return Promise.resolve({
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
}

function spawnPipeCapture(
  exePath: string,
  argumentsString: string,
  cwd: string,
  onData: (chunk: string) => void,
): Promise<ConsoleCaptureHandle> {
  return new Promise((resolve, reject) => {
    const args = splitCommandLine(argumentsString);
    const child = spawn(exePath, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
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

    let resolved = false;
    let settled = false;
    let exitResolve!: (code: number | null) => void;
    const exitPromise = new Promise<number | null>((res) => {
      exitResolve = res;
    });

    const closeReadersAndResolveExit = (code: number | null) => {
      for (const rl of readers) {
        rl.close();
      }
      if (!settled) {
        settled = true;
        exitResolve(code);
      }
    };

    child.on("error", (err) => {
      for (const rl of readers) {
        rl.close();
      }
      if (!resolved) {
        resolved = true;
        reject(err);
        return;
      }
      onData(`[错误] SteamCMD 启动/运行失败: ${err.message}\n`);
      closeReadersAndResolveExit(1);
    });
    child.on("exit", (code) => {
      closeReadersAndResolveExit(code);
    });
    child.on("close", (code) => {
      closeReadersAndResolveExit(code);
    });

    if (!child.pid) {
      resolved = true;
      reject(new Error("无法启动 SteamCMD 进程"));
      return;
    }

    resolved = true;
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

function fileSizeOrZero(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    return 0;
  }
  return fs.statSync(filePath).size;
}

function readNewBytes(filePath: string, offset: number): { text: string; newOffset: number } {
  if (!fs.existsSync(filePath)) {
    return { text: "", newOffset: 0 };
  }
  const stat = fs.statSync(filePath);
  const effectiveOffset = stat.size < offset ? 0 : offset;
  if (stat.size <= effectiveOffset) {
    return { text: "", newOffset: effectiveOffset };
  }
  const length = stat.size - effectiveOffset;
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, length, effectiveOffset);
  } finally {
    fs.closeSync(fd);
  }
  return { text: buffer.toString("utf8"), newOffset: stat.size };
}

function drainMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
