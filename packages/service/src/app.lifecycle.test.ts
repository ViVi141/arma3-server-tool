import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createService } from "./app.js";

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
