import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { healthRoutes } from "../api/health.js";
import { apiRoutes } from "../api/routes.js";

// We need the decorated service instances. For integration tests,
// create a minimal Fastify instance with mock services.
import { processManager, ProcessManager } from "../process/manager.js";
import { ConfigStore } from "../config/store.js";
import { ConfigSnapshotStore } from "../config/snapshot.js";
import { SteamCmdManager } from "../steamcmd/manager.js";
import { ModScanner } from "../mods/scanner.js";
import { MonitoringDb } from "../monitoring/db.js";
import { Scheduler } from "../scheduling/cron.js";
import { asyncTaskManager } from "../task/manager.js";
import { RptLogReader } from "../logs/reader.js";
import { UiSettingsStore } from "../settings/ui-settings.js";
import { ModScanPathStore } from "../mods/scan-path-store.js";
import { SteamCmdSettingsStore } from "../settings/steamcmd-settings.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

let app: ReturnType<typeof Fastify>;
let tmpDir: string;
let monitorDb: MonitoringDb;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-api-test-"));

  app = Fastify();
  const configStore = new ConfigStore(tmpDir);
  const snapshotStore = new ConfigSnapshotStore(tmpDir);
  const steamCmd = new SteamCmdManager(tmpDir);
  const modScanner = new ModScanner();
  monitorDb = new MonitoringDb(tmpDir);
  await monitorDb.waitReady();
  const scheduler = new Scheduler();
  const rptLogReader = new RptLogReader();

  app.decorate("configStore", configStore);
  app.decorate("snapshotStore", snapshotStore);
  app.decorate("processManager", processManager);
  app.decorate("steamCmd", steamCmd);
  app.decorate("modScanner", modScanner);
  app.decorate("monitorDb", monitorDb);
  app.decorate("scheduler", scheduler);
  app.decorate("rptLogReader", rptLogReader);
  app.decorate("uiSettingsStore", new UiSettingsStore(tmpDir));
  app.decorate("modScanPathStore", new ModScanPathStore(tmpDir));
  app.decorate("steamCmdSettingsStore", new SteamCmdSettingsStore(tmpDir));
  app.decorate("asyncTaskManager", asyncTaskManager);
  app.decorate("dataDir", tmpDir);

  await app.register(healthRoutes, { prefix: "/api/v1" });
  await app.register(apiRoutes, { prefix: "/api/v1" });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  monitorDb.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("API Routes Integration", () => {
  it("GET /api/v1/health returns 200", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.service).toContain("Service");
  });

  it("GET /api/v1/actions returns action list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/actions" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.taskActions).toBeInstanceOf(Array);
    expect(body.data.taskActions.length).toBeGreaterThanOrEqual(20);
  });

  it("GET /api/v1/servers returns empty array", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/servers" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual([]);
  });

  it("POST /api/v1/servers creates a server", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/servers",
      payload: { configName: "Test", serverDir: "C:\\arma3" },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.uuid).toBeTypeOf("string");

    const configRes = await app.inject({
      method: "GET",
      url: `/api/v1/servers/${body.data.uuid}/config`,
    });
    expect(configRes.statusCode).toBe(200);
    const configBody = JSON.parse(configRes.payload);
    expect(configBody.data.server.serverDir).toBe("C:\\arma3");
    expect(configBody.data.server.configName).toBe("Test");
  });

  it("PUT /api/v1/settings/steamcmd persists workshop root", async () => {
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/v1/settings/steamcmd",
      payload: { workshopRoot: "D:\\SteamLibrary", serverInstallPath: "D:\\arma3" },
    });
    expect(putRes.statusCode).toBe(200);
    const putBody = JSON.parse(putRes.payload);
    expect(putBody.data.workshopRoot).toBe("D:\\SteamLibrary");

    const getRes = await app.inject({ method: "GET", url: "/api/v1/settings/steamcmd" });
    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.payload);
    expect(getBody.data.workshopRoot).toBe("D:\\SteamLibrary");
    expect(getBody.data.serverInstallPath).toBe("D:\\arma3");
  });

  it("POST /api/v1/task executes a status command", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/task",
      payload: { serverUuid: "test-uuid", commands: [{ action: "status" }] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.success).toBe(true);
    expect(body.data.results[0].action).toBe("status");
  });

  it("POST /api/v1/task with async returns taskId", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/task",
      payload: { serverUuid: "test-uuid", commands: [{ action: "status" }], async: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.taskId).toBeTypeOf("string");
    expect(body.data.status).toBe("Running");
  });

  it("POST /api/v1/task with invalid uuid returns error", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/task",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/servers/:uuid/bans returns empty array", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/servers",
      payload: { configName: "BanTest", serverDir: tmpDir },
    });
    const uuid = JSON.parse(createRes.payload).data.uuid as string;

    const res = await app.inject({ method: "GET", url: `/api/v1/servers/${uuid}/bans` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).data).toEqual([]);
  });

  it("PUT /api/v1/servers/:uuid/bans saves bans", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/servers",
      payload: { configName: "BanSave", serverDir: tmpDir },
    });
    const uuid = JSON.parse(createRes.payload).data.uuid as string;

    const res = await app.inject({
      method: "PUT",
      url: `/api/v1/servers/${uuid}/bans`,
      payload: [{ guid: "abc123", time: "永久封禁", reason: "cheating" }],
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).success).toBe(true);

    const list = await app.inject({ method: "GET", url: `/api/v1/servers/${uuid}/bans` });
    expect(JSON.parse(list.payload).data).toHaveLength(1);
  });

  it("GET /api/v1/monitoring/collect records stats", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/monitoring/collect" });
    expect(res.statusCode).toBe(200);
  });
});
