import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const { mockSpawn, spawnedProcs } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  spawnedProcs: [] as Array<EventEmitter & { pid: number; killed: boolean; kill: ReturnType<typeof vi.fn> }>,
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

vi.mock("../mods/mod-config-sync.js", () => ({
  scanModsForConfig: vi.fn(() => []),
}));

vi.mock("../config/game-config-writer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../config/game-config-writer.js")>(),
  getServerExecutablePath: vi.fn(() => "C:\\arma3\\arma3server_x64.exe"),
  buildHeadlessClientCommandLine: vi.fn(() => "-client -connect=127.0.0.1"),
  splitCommandLine: vi.fn((s: string) => s.split(" ")),
}));

import { startHeadlessClient, stopAllHeadlessClients } from "./headless.js";
import { maintenanceLocks } from "../maintenance/locks.js";
import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";

function makeFakeProc(pid: number) {
  const proc = new EventEmitter() as EventEmitter & {
    pid: number;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.pid = pid;
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.killed = true;
  });
  return proc;
}

describe("BUG-10 headless client error handling and shutdown cleanup", () => {
  const fakeApp = {
    log: { error: vi.fn() },
  } as unknown as FastifyInstance;

  const baseConfig: ServerConfigPackage = {
    formatVersion: 2,
    server: { serverDir: "C:\\arma3", configName: "HC Test" },
    tasks: { enableHeadlessClient: true },
  };

  let tempDir: string;
  beforeEach(() => {
    stopAllHeadlessClients();
    mockSpawn.mockReset();
    spawnedProcs.length = 0;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-hc-"));
    baseConfig.server!.serverDir = tempDir;
  });
  afterEach(() => {
    stopAllHeadlessClients();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("attaches proc error listener so ENOENT does not crash and removes map entry", () => {
    const proc = makeFakeProc(4001);
    mockSpawn.mockReturnValueOnce(proc);

    const res = startHeadlessClient(fakeApp, "hc-uuid-1", baseConfig);
    expect(res.success).toBe(true);

    expect(() => proc.emit("error", new Error("spawn ENOENT"))).not.toThrow();
    expect(fakeApp.log.error).toHaveBeenCalled();

    // Subsequent stopAllHeadlessClients should not kill an already-errored proc
    stopAllHeadlessClients();
    expect(proc.kill).not.toHaveBeenCalled();
  });

  it("维护启动禁止替换跟踪中的 HC，不顺带终止旧进程", () => {
    const proc = makeFakeProc(4100); mockSpawn.mockReturnValueOnce(proc);
    expect(startHeadlessClient(fakeApp, "maintenance-hc", baseConfig, { replace: false }).success).toBe(true);
    expect(startHeadlessClient(fakeApp, "maintenance-hc", baseConfig, { replace: false }).success).toBe(false);
    expect(proc.kill).not.toHaveBeenCalled(); expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("Service 清理不绕过维护锁，也不停止本次已恢复的 HC", () => {
    const proc = makeFakeProc(4200); mockSpawn.mockReturnValueOnce(proc);
    startHeadlessClient(fakeApp, "protected-hc", baseConfig);
    const lock = maintenanceLocks.acquire({ instances: ["protected-hc"] });
    try { stopAllHeadlessClients({ skipLocked: true }); expect(proc.kill).not.toHaveBeenCalled(); }
    finally { lock.release(); }
    stopAllHeadlessClients({ preservePids: [4200] }); expect(proc.kill).not.toHaveBeenCalled();
    stopAllHeadlessClients(); expect(proc.kill).toHaveBeenCalledTimes(1);
  });

  it("stopAllHeadlessClients kills all active HC instances", () => {
    const p1 = makeFakeProc(4002);
    const p2 = makeFakeProc(4003);
    mockSpawn.mockReturnValueOnce(p1).mockReturnValueOnce(p2);

    startHeadlessClient(fakeApp, "hc-a", baseConfig);
    startHeadlessClient(fakeApp, "hc-b", baseConfig);

    stopAllHeadlessClients();
    expect(p1.kill).toHaveBeenCalledTimes(1);
    expect(p2.kill).toHaveBeenCalledTimes(1);
  });
});
