import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

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

vi.mock("../config/game-config-writer.js", () => ({
  getServerExecutablePath: vi.fn(() => "C:\\arma3\\arma3server_x64.exe"),
  buildHeadlessClientCommandLine: vi.fn(() => "-client -connect=127.0.0.1"),
  splitCommandLine: vi.fn((s: string) => s.split(" ")),
}));

import { startHeadlessClient, stopAllHeadlessClients } from "./headless.js";
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

  beforeEach(() => {
    stopAllHeadlessClients();
    mockSpawn.mockReset();
    spawnedProcs.length = 0;
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
