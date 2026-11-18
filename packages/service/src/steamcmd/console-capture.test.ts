import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const { mockSpawn, mockIsWindows } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockIsWindows: vi.fn(() => false),
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

vi.mock("../platform/index.js", () => ({
  isWindows: mockIsWindows,
}));

import { spawnConsoleCapture } from "./console-capture.js";

describe("BUG-9 & SEC-2 console-capture", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-cc-test-"));
    mockSpawn.mockReset();
    mockIsWindows.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("spawnPipeCapture settles waitForExit(1) when child emits error after resolve", async () => {
    mockIsWindows.mockReturnValue(false);
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdout: null;
      stderr: null;
      kill: ReturnType<typeof vi.fn>;
    };
    child.pid = 1234;
    child.stdout = null;
    child.stderr = null;
    child.kill = vi.fn();
    mockSpawn.mockReturnValueOnce(child);

    const chunks: string[] = [];
    const handle = await spawnConsoleCapture(
      "/opt/steamcmd/steamcmd.sh",
      "+quit",
      tmpDir,
      (chunk) => chunks.push(chunk),
      tmpDir
    );

    // Simulate async execve ENOENT arriving after synchronous resolve
    setTimeout(() => {
      child.emit("error", new Error("spawn ENOENT"));
    }, 10);

    const exitCode = await handle.waitForExit();
    expect(exitCode).toBe(1);
    expect(chunks.join("")).toContain("SteamCMD 启动/运行失败");
    expect(chunks.join("")).toContain("ENOENT");
  });

  it("spawnWindowsCaptured redacts debugMsg and resets offset to 0 when console_log.txt truncates", async () => {
    mockIsWindows.mockReturnValue(true);
    const logDir = path.join(tmpDir, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, "console_log.txt");
    // Pre-existing 100 bytes from previous run
    fs.writeFileSync(logFile, "A".repeat(100), "utf-8");

    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      kill: ReturnType<typeof vi.fn>;
    };
    child.pid = 5678;
    child.kill = vi.fn();
    mockSpawn.mockReturnValueOnce(child);

    const chunks: string[] = [];
    const handle = await spawnConsoleCapture(
      "C:\\steamcmd\\steamcmd.exe",
      '+login "builder" "SecretPass!" +quit',
      tmpDir,
      (chunk) => chunks.push(chunk),
      tmpDir,
      { password: "SecretPass!" }
    );

    // Debug message must never expose SecretPass!
    expect(chunks[0]).toContain("[调试] ProcessStartInfo.Arguments:");
    expect(chunks[0]).not.toContain("SecretPass!");
    expect(chunks[0]).toContain("***");

    // Truncate file below initial 100-byte offset
    fs.writeFileSync(logFile, "NewRunOutput\n", "utf-8");

    // Wait for one poll tick (400ms) then exit
    await new Promise((r) => setTimeout(r, 500));
    child.emit("exit", 0);
    const code = await handle.waitForExit();
    expect(code).toBe(0);
    expect(chunks.join("")).toContain("NewRunOutput\n");
  });
});
