import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetchRconPlayers, mockCountOnlinePlayers } = vi.hoisted(() => ({
  mockFetchRconPlayers: vi.fn(),
  mockCountOnlinePlayers: vi.fn(),
}));

vi.mock("../rcon/helpers.js", () => ({
  fetchRconPlayers: mockFetchRconPlayers,
  countOnlinePlayers: mockCountOnlinePlayers,
}));

import { syncCronJobsForServer } from "./cron-sync.js";
import type { FastifyInstance } from "fastify";

describe("PERF-2 cron-sync monitoring tick batch persistence", () => {
  beforeEach(() => {
    mockFetchRconPlayers.mockReset();
    mockCountOnlinePlayers.mockReset();
  });

  it("uses recordCollectionTick once instead of N+1 recordPlayer/recordStats calls", async () => {
    const registeredHandlers = new Map<string, () => Promise<void> | void>();
    const recordCollectionTick = vi.fn();
    const recordPlayer = vi.fn();
    const recordStats = vi.fn();

    const fakeApp = {
      configStore: {
        load: vi.fn(() => ({
          formatVersion: 2,
          scheduler: { monitoringCron: "*/5 * * * *" },
        })),
      },
      processManager: {
        getState: vi.fn(() => ({ isRunning: true, pid: 1234 })),
      },
      monitorDb: {
        recordCollectionTick,
        recordPlayer,
        recordStats,
      },
      scheduler: {
        list: vi.fn(() => []),
        remove: vi.fn(),
        add: vi.fn((job: { name: string; handler: () => Promise<void> | void }) => {
          registeredHandlers.set(job.name, job.handler);
          return true;
        }),
      },
      log: { info: vi.fn(), warn: vi.fn() },
    } as unknown as FastifyInstance;

    const syncRes = syncCronJobsForServer(fakeApp, "uuid-cron");
    expect(syncRes.success).toBe(true);
    expect(syncRes.count).toBe(1);

    mockCountOnlinePlayers.mockResolvedValueOnce(3);
    mockFetchRconPlayers.mockResolvedValueOnce([
      { num: 1, guid: "g1", name: "Alice" },
      { num: 2, guid: "g2", name: "Bob" },
      { num: 3, guid: "g3", name: "Charlie" },
    ]);

    const handler = registeredHandlers.get("uuid-cron-monitoring");
    expect(handler).toBeDefined();
    await handler!();

    expect(recordCollectionTick).toHaveBeenCalledTimes(1);
    expect(recordCollectionTick).toHaveBeenCalledWith(
      "uuid-cron",
      3,
      expect.arrayContaining([
        expect.objectContaining({ playerGuid: "g1", playerName: "Alice", serverUuid: "uuid-cron" }),
        expect.objectContaining({ playerGuid: "g2", playerName: "Bob", serverUuid: "uuid-cron" }),
        expect.objectContaining({ playerGuid: "g3", playerName: "Charlie", serverUuid: "uuid-cron" }),
      ])
    );
    expect(recordPlayer).not.toHaveBeenCalled();
    expect(recordStats).not.toHaveBeenCalled();
  });
});
