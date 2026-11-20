import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const { mockSpawnConsoleCapture, mockProxyFetch, createdDestroySpies, streamHook } = vi.hoisted(() => ({
  mockSpawnConsoleCapture: vi.fn(),
  mockProxyFetch: vi.fn(),
  createdDestroySpies: [] as Array<ReturnType<typeof vi.fn>>,
  streamHook: { wrap: false },
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    createWriteStream: (...args: Parameters<typeof actual.createWriteStream>) => {
      const ws = actual.createWriteStream(...args);
      if (streamHook.wrap) {
        const origDestroy = ws.destroy.bind(ws);
        const spy = vi.fn((err?: Error) => origDestroy(err));
        ws.destroy = spy as typeof ws.destroy;
        createdDestroySpies.push(spy);
      }
      return ws;
    },
  };
});

vi.mock("./console-capture.js", () => ({
  spawnConsoleCapture: mockSpawnConsoleCapture,
}));

vi.mock("./proxy-fetch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./proxy-fetch.js")>();
  return {
    ...actual,
    proxyFetch: mockProxyFetch,
  };
});

import { SteamCmdManager } from "./manager.js";
import { resolveSteamCmdPath, steamCmdBootstrapRelativePath } from "../platform/index.js";

describe("SteamCmdManager capture", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-steamcmd-test-"));
    mockSpawnConsoleCapture.mockReset();
    mockProxyFetch.mockReset();
    createdDestroySpies.length = 0;
    streamHook.wrap = false;
  });

  afterEach(() => {
    streamHook.wrap = false;
    vi.restoreAllMocks();
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        // Windows CI 上日志/写入句柄可能尚未释放，rmdir 会抛 ENOTEMPTY/EBUSY；
        // 重试后仍失败也不应让清理动作改变测试结论
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        /* 临时目录残留交由系统清理 */
      }
    }
  });

  it("创建 capture 期间取消会终止迟到进程，退出前不放行下一个操作", async () => {
    const manager = new SteamCmdManager(tmpDir);
    vi.spyOn(manager, "purgeOrphanSteamCmdProcesses").mockReturnValue(0);
    const inner = manager as unknown as { ensureInstalledBody: () => Promise<void>; runCapturedProcess: (id: number, args: string, output: (text: string) => void) => Promise<number>; withExclusiveLock: (fn: (id: number) => Promise<void>) => Promise<void> };
    inner.ensureInstalledBody = vi.fn(async () => {});
    let created!: (capture: object) => void; let exited!: (code: number) => void;
    const exit = new Promise<number>((resolve) => { exited = resolve; });
    const kill = vi.fn();
    mockSpawnConsoleCapture.mockReturnValueOnce(new Promise((resolve) => { created = resolve; }));
    const operation = inner.withExclusiveLock(async (id) => { await inner.runCapturedProcess(id, "+quit", () => {}); }).catch((error: Error) => error.message);
    manager.requestAbort(); manager.clearAbort();
    const next = manager.ensureInstalled();
    created({ kill, waitForExit: () => exit });
    await vi.waitFor(() => expect(kill).toHaveBeenCalledTimes(1));
    expect(inner.ensureInstalledBody).not.toHaveBeenCalled();
    expect(manager.isBusy).toBe(true);
    exited(0);
    expect(await operation).toBe("SteamCMD 操作已取消");
    await next;
    expect(inner.ensureInstalledBody).toHaveBeenCalledTimes(1);
  });

  it("getAggregatedLog returns latest session console capture", () => {
    const sessionDir = path.join(tmpDir, "logs", "steamcmd");
    fs.mkdirSync(sessionDir, { recursive: true });
    const logPath = path.join(sessionDir, "steamcmd_20260612_205500.log");
    fs.writeFileSync(
      logPath,
      "时间: 2026-06-12\n--- console ---\nLogging in user...\nSuccess. Downloaded item 123\n"
    );

    const manager = new SteamCmdManager(tmpDir);
    const aggregated = manager.getAggregatedLog(50);
    expect(aggregated).toContain("Success. Downloaded item 123");
    expect(aggregated).not.toContain("content_log.txt");
  });

  it("SEC-2 redacts Steam password from live output events, aggregated log, and session log file", async () => {
    const exePath = resolveSteamCmdPath(tmpDir);
    const bootstrapPath = path.join(tmpDir, steamCmdBootstrapRelativePath());
    fs.mkdirSync(path.dirname(bootstrapPath), { recursive: true });
    fs.writeFileSync(exePath, "fake-exe");
    fs.writeFileSync(bootstrapPath, "bootstrapped");

    const secret = 'SuperSecretPassword!123"\\x';
    const manager = new SteamCmdManager(tmpDir);
    manager.setCredentials("builder", secret);
    manager.setWorkshopRoot(path.join(tmpDir, "workshop"));

    const emitted: string[] = [];
    manager.on("output", (chunk: string) => emitted.push(chunk));

    mockSpawnConsoleCapture.mockImplementation(
      async (
        _exe: string,
        args: string,
        _cwd: string,
        onData: (chunk: string) => void
      ) => {
        onData(`[调试] ProcessStartInfo.Arguments: ${args}\n`);
        onData(`Logging in user 'builder' with password ${secret}\n`);
        onData("Success. Downloaded item 450814997\n");
        return {
          pid: 9999,
          kill: vi.fn(),
          waitForExit: async () => 0,
        };
      }
    );

    await manager.downloadWorkshopMods([450814997]);

    const joinedEvents = emitted.join("");
    expect(joinedEvents).not.toContain(secret);
    expect(joinedEvents).not.toContain('SuperSecretPassword!123\\"\\\\x');
    expect(joinedEvents).toContain("***");

    const aggregated = manager.getAggregatedLog(50);
    expect(aggregated).not.toContain(secret);
    expect(aggregated).toContain("***");

    const sessionDir = path.join(tmpDir, "logs", "steamcmd");
    const logFiles = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".log"));
    expect(logFiles.length).toBeGreaterThanOrEqual(1);
    const diskLog = fs.readFileSync(path.join(sessionDir, logFiles[0]), "utf-8");
    expect(diskLog).not.toContain(secret);
    expect(diskLog).not.toContain('SuperSecretPassword!123\\"\\\\x');
    expect(diskLog).toContain("***");
  });

  it("BUG-11 cleans up download writer, reader, and partial archive when aborted mid-stream", async () => {
    const manager = new SteamCmdManager(tmpDir);
    streamHook.wrap = true;

    let readCount = 0;
    const cancelSpy = vi.fn(async () => {});
    const fakeReader = {
      read: vi.fn(async () => {
        readCount += 1;
        if (readCount === 1) {
          setTimeout(() => manager.requestAbort(), 0);
          return { done: false, value: new Uint8Array([1, 2, 3, 4]) };
        }
        await new Promise((r) => setTimeout(r, 20));
        return { done: false, value: new Uint8Array([5, 6]) };
      }),
      cancel: cancelSpy,
    };

    mockProxyFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": "1024" }),
      body: {
        getReader: () => fakeReader,
      },
    });

    await expect(manager.ensureInstalled()).rejects.toThrow("SteamCMD 操作已取消");
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(createdDestroySpies).toHaveLength(1);
    expect(createdDestroySpies[0]).toHaveBeenCalled();

    const files = fs.readdirSync(tmpDir);
    expect(files.some((f) => f.endsWith(".zip") || f.endsWith(".tar.gz"))).toBe(false);
  }, 20_000);

  it("BUG-11 generates unique session log filenames within the same second", () => {
    const manager = new SteamCmdManager(tmpDir) as unknown as {
      createSessionLogPath: () => string;
    };
    const p1 = manager.createSessionLogPath();
    const p2 = manager.createSessionLogPath();
    const p3 = manager.createSessionLogPath();
    expect(new Set([p1, p2, p3]).size).toBe(3);
  });
});
