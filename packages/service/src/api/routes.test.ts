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
    expect(body.data.taskActions).toContain("create_server");
    expect(body.data.taskActions).toContain("first_server_setup");
    expect(body.data.taskActions).toContain("ensure_steamcmd");
    const paths = body.data.restEndpoints.map((e: { path: string }) => e.path);
    expect(paths).toContain("/api/v1/servers");
    expect(paths).toContain("/api/v1/steamcmd/stop");
    expect(paths).toContain("/api/v1/tasks/{taskId}");
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

    const listRes = await app.inject({ method: "GET", url: "/api/v1/servers" });
    const list = JSON.parse(listRes.payload) as { uuid: string; configName: string }[];
    const created = list.find((s) => s.uuid === body.data.uuid);
    expect(created?.configName).toBe("Test");
  });

  it("clone clears processById from the source server", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/servers",
      payload: { configName: "Source", serverDir: tmpDir },
    });
    const uuid = JSON.parse(createRes.payload).data.uuid as string;

    await app.inject({
      method: "PUT",
      url: `/api/v1/servers/${uuid}/config`,
      payload: {
        formatVersion: 2,
        server: { configName: "Source", serverDir: tmpDir },
        tasks: { processById: 99999, missions: [{ template: "A.Altis", difficulty: 3 }] },
      },
    });

    // PUT 会清掉无法校验的 PID；直接写入模拟「整包导入残留」场景
    const planted = app.configStore.load(uuid)!;
    planted.tasks = { ...planted.tasks, processById: 99999 };
    app.configStore.save(uuid, planted);
    expect(app.configStore.load(uuid)!.tasks?.processById).toBe(99999);

    const cloneRes = await app.inject({
      method: "POST",
      url: `/api/v1/servers/${uuid}/clone`,
    });
    expect(cloneRes.statusCode).toBe(201);
    const newUuid = JSON.parse(cloneRes.payload).data.uuid as string;

    const configRes = await app.inject({
      method: "GET",
      url: `/api/v1/servers/${newUuid}/config`,
    });
    const cloned = JSON.parse(configRes.payload).data;
    expect(cloned.tasks.processById).toBe(0);

    const statusRes = await app.inject({
      method: "GET",
      url: `/api/v1/servers/${newUuid}/status`,
    });
    expect(JSON.parse(statusRes.payload).isRunning).toBe(false);
  });

  it("PUT config clears foreign processById on import", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/servers",
      payload: { configName: "ImportPid", serverDir: tmpDir },
    });
    const uuid = JSON.parse(createRes.payload).data.uuid as string;

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/v1/servers/${uuid}/config`,
      payload: {
        formatVersion: 2,
        server: { configName: "ImportPid", serverDir: tmpDir },
        tasks: { processById: 424242 },
      },
    });
    expect(putRes.statusCode).toBe(200);
    const loaded = JSON.parse(
      (await app.inject({ method: "GET", url: `/api/v1/servers/${uuid}/config` })).payload
    ).data;
    expect(loaded.tasks.processById).toBe(0);
  });

  it("PUT config?writeCfg=true writes server.cfg", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/servers",
      payload: { configName: "WriteCfg", serverDir: tmpDir },
    });
    const uuid = JSON.parse(createRes.payload).data.uuid as string;

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/v1/servers/${uuid}/config?writeCfg=true`,
      payload: {
        formatVersion: 2,
        server: { configName: "WriteCfg", serverDir: tmpDir, executable: "arma3server_x64.exe" },
        basic: { hostname: "WriteCfg Host", maxPlayers: 16, port: 2502 },
        startup: { port: 2502 },
        tasks: {
          missions: [
            { template: "First.Altis", difficulty: 3 },
            { template: "Second.Malden", difficulty: 1 },
          ],
        },
      },
    });
    expect(putRes.statusCode).toBe(200);
    const putBody = JSON.parse(putRes.payload);
    expect(putBody.success).toBe(true);
    expect(putBody.data.message).toContain("写入");

    const cfgPath = path.join(tmpDir, "a3st_serverconfig", uuid, "server.cfg");
    expect(fs.existsSync(cfgPath)).toBe(true);
    const cfgText = fs.readFileSync(cfgPath, "utf-8");
    expect(cfgText).toContain("First.Altis");
    expect(cfgText).not.toContain("Second.Malden");
  });

  it("DELETE /api/v1/tasks/:taskId cancels a running task", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/task",
      payload: {
        serverUuid: "test-uuid",
        commands: [{ action: "status" }],
        async: true,
      },
    });
    const taskId = JSON.parse(res.payload).data.taskId as string;

    // status is fast; cancel may already be finished — endpoint must still succeed
    const del = await app.inject({ method: "DELETE", url: `/api/v1/tasks/${taskId}` });
    expect(del.statusCode).toBe(200);
    expect(JSON.parse(del.payload).success).toBe(true);
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
