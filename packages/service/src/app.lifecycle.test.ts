import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createService } from "./app.js";
import { OperationsStore } from "./operations/store.js";
import type { MaintenanceBatch } from "./maintenance/executor.js";

describe("BUG-13 & BUG-2 createService lifecycle, onClose cleanup, and monitorDb readiness", () => {
  const tmpDirs: string[] = [];
  const apps: Array<Awaited<ReturnType<typeof createService>>> = [];

  afterEach(async () => {
    for (const app of apps.splice(0)) {
      await app.close();
    }
    for (const dir of tmpDirs.splice(0)) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("clears scheduler, unwires SSE listeners, and closes monitorDb idempotently on app.close()", async () => {
    const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-life-1-"));
    tmpDirs.push(dir1);

    const app1 = await createService({ port: 0, host: "127.0.0.1", dataDir: dir1 });
    apps.push(app1);

    expect(app1.steamCmd.listenerCount("output")).toBe(1);
    app1.scheduler.add({
      name: "test-lifecycle-job",
      schedule: "0 * * * *",
      handler: () => {},
    });
    expect(app1.scheduler.list()).toHaveLength(1);

    await app1.close();
    apps.pop();

    expect(app1.steamCmd.listenerCount("output")).toBe(0);
    expect(app1.scheduler.list()).toHaveLength(0);
    // Calling monitorDb.close() again must be idempotent
    expect(() => app1.monitorDb.close()).not.toThrow();

    // Sequential second instance must start with exactly 1 output listener (no singleton accumulation)
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-life-2-"));
    tmpDirs.push(dir2);
    const app2 = await createService({ port: 0, host: "127.0.0.1", dataDir: dir2 });
    apps.push(app2);
    expect(app2.steamCmd.listenerCount("output")).toBe(1);
  });

  it("关闭时撤销等待下载，当前协程退出前不关闭运维数据库，且不再接收业务", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-close-queue-")); tmpDirs.push(dir);
    const app = await createService({ port: 0, host: "127.0.0.1", dataDir: dir }); apps.push(app);
    vi.spyOn(app.steamCmd, "purgeOrphanSteamCmdProcesses").mockReturnValue(0);
    const inner = app.steamCmd as unknown as { ensureInstalledBody: () => Promise<void> };
    let release!: () => void;
    inner.ensureInstalledBody = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const first = app.steamCmd.ensureInstalled().catch((error: Error) => error.message);
    const second = app.steamCmd.ensureInstalled().catch((error: Error) => error.message);
    const closeDb = vi.spyOn(app.operations, "close");
    const closing = app.close();
    await vi.waitFor(() => expect(app.steamCmd.isAborted).toBe(true));
    expect(await second).toContain("已取消");
    expect(closeDb).not.toHaveBeenCalled();
    await expect(app.steamCmd.ensureInstalled()).rejects.toThrow("已关闭");
    release(); expect(await first).toContain("已取消"); await closing;
    expect(inner.ensureInstalledBody).toHaveBeenCalledTimes(1);
    expect(closeDb).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("启动先处理持久中断批次，首次结果查询不会把旧排队任务当作仍在执行", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-maintenance-boot-")); tmpDirs.push(dir);
    const store = new OperationsStore(dir); await store.waitReady();
    const at = new Date().toISOString();
    const interrupted: MaintenanceBatch = { id: "interrupted-batch", state: "queued", createdAt: at, updatedAt: at, serverUuids: [], modIds: [], result: null, requiresAttention: false,
      recovery: { version: 1, request: { serverUuid: "s1", keys: ["a".repeat(64)], retryOf: null }, plan: null, backups: [], stopStarted: false, writesStarted: false, started: [], rollbackPhase: "none", failureCode: null } };
    store.checkpoint(interrupted); store.close();
    const app = await createService({ port: 0, host: "127.0.0.1", dataDir: dir }); apps.push(app);
    const result = await app.inject({ method: "GET", url: "/api/v1/ops/maintenance/interrupted-batch" });
    expect(result.json().data).toMatchObject({ state: "cancelled", result: "INTERRUPTED" });
    expect(app.maintenanceExecutor).toBeDefined(); expect(app.scheduler.list()).toHaveLength(0);
  });

  it("关闭必须先等待维护恢复，之后才关闭 Steam 队列、健康服务和数据库", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-maintenance-close-")); tmpDirs.push(dir);
    const app = await createService({ port: 0, host: "127.0.0.1", dataDir: dir }); apps.push(app);
    let release!: () => void;
    const original = app.maintenanceExecutor.close.bind(app.maintenanceExecutor);
    const recovery = vi.spyOn(app.maintenanceExecutor, "close").mockImplementation(async () => { await new Promise<void>((resolve) => { release = resolve; }); await original(); });
    const steam = vi.spyOn(app.steamCmd, "close"), health = vi.spyOn(app.serverHealth, "close"), database = vi.spyOn(app.operations, "close");
    const closing = app.close();
    await vi.waitFor(() => expect(recovery).toHaveBeenCalled());
    expect(steam).not.toHaveBeenCalled(); expect(health).not.toHaveBeenCalled(); expect(database).not.toHaveBeenCalled();
    release(); await closing;
    expect(steam).toHaveBeenCalledTimes(1); expect(health).toHaveBeenCalledTimes(1); expect(database).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("BUG-2 awaits monitorDb.waitReady() so immediate ingest right after createService persists", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-db-ready-"));
    tmpDirs.push(dir);

    const app = await createService({ port: 0, host: "127.0.0.1", dataDir: dir });
    apps.push(app);

    const addr = app.server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("expected TCP address");
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const ingestRes = await fetch(`${baseUrl}/api/v1/servers/uuid-1/monitoring/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "ObjectManipulationNum|0:0:12" }),
    });
    expect(ingestRes.status).toBe(200);

    const summaryRes = await fetch(`${baseUrl}/api/v1/servers/uuid-1/monitoring/summary`);
    expect(summaryRes.status).toBe(200);
    const summaryBody = (await summaryRes.json()) as {
      success: boolean;
      data: { totalEntries: number; peakPlayers: number };
    };
    expect(summaryBody.success).toBe(true);
    expect(summaryBody.data.totalEntries).toBe(1);
    expect(summaryBody.data.peakPlayers).toBe(12);
  });
});
