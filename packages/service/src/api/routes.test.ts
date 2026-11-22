import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify from "fastify";
import { healthRoutes } from "../api/health.js";
import { apiRoutes } from "../api/routes.js";
import { createService } from "../app.js";
import { RconClient } from "../rcon/client.js";
import { closeAllRconSessions } from "../rcon/session.js";

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
import { ServerHealthService } from "../health/service.js";
import { defaultMaintenancePolicy } from "../maintenance/policy.js";
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
  app.decorate("serverHealth", new ServerHealthService(app));
  app.addHook("onClose", async () => { app.serverHealth.close(); });
  app.decorate("uiSettingsStore", new UiSettingsStore(tmpDir));
  app.decorate("modScanPathStore", new ModScanPathStore(tmpDir));
  app.decorate("steamCmdSettingsStore", new SteamCmdSettingsStore(tmpDir));
  app.decorate("asyncTaskManager", asyncTaskManager);
  app.decorate("dataDir", tmpDir);
  app.decorate("serviceOptions", {
    port: 19580,
    host: "127.0.0.1",
    dataDir: tmpDir,
  });

  await app.register(healthRoutes, { prefix: "/api/v1" });
  await app.register(apiRoutes, { prefix: "/api/v1" });
  await app.ready();
});

afterAll(async () => {
  closeAllRconSessions();
  await app.close();
  monitorDb.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("API Routes Integration", () => {
  it("维护配置 PUT/PATCH 在写 cfg 和快照前验证；克隆不继承维护授权", async () => {
    const serverDir = path.join(tmpDir, "maintenance-api-server");
    const created = await app.inject({ method: "POST", url: "/api/v1/servers", payload: { configName: "维护配置", serverDir } });
    const uuid = created.json().data.uuid as string;
    const original = app.configStore.load(uuid)!;
    const maintenance = { ...defaultMaintenancePolicy(), enabled: true, template: "idle_first" as const, windowConfirmed: true, allowOccupied: true, occupiedConfirmed: true };
    const save = vi.spyOn(app.configStore, "save");
    try {
      for (const method of ["PUT", "PATCH"] as const) {
        const rejected = await app.inject({ method, url: `/api/v1/servers/${uuid}/config?writeCfg=true`, payload: { ...original, maintenance: { ...maintenance, occupiedConfirmed: false } } });
        expect(rejected.statusCode).toBe(400);
        expect(rejected.json().error).toBe("INVALID_MAINTENANCE_CONFIG");
      }
      expect(save).not.toHaveBeenCalled();
      expect(fs.existsSync(serverDir)).toBe(false);
      expect(app.configStore.load(uuid)).toEqual(original);
      const saved = await app.inject({ method: "PATCH", url: `/api/v1/servers/${uuid}/config`, payload: { maintenance } });
      expect(saved.statusCode).toBe(200);
      expect(new ConfigStore(tmpDir).load(uuid)?.maintenance).toEqual(maintenance);
      expect(fs.existsSync(serverDir)).toBe(false);
      const cloned = await app.inject({ method: "POST", url: `/api/v1/servers/${uuid}/clone` });
      expect(cloned.statusCode).toBe(201);
      expect(app.configStore.load(cloned.json().data.uuid)?.maintenance).toEqual({ ...maintenance, enabled: false, windowConfirmed: false, allowOccupied: false, occupiedConfirmed: false });
      expect(app.configStore.load(uuid)?.maintenance).toEqual(maintenance);
    } finally { save.mockRestore(); }
  });
  it("健康 API 保持进程语义；无人配置验证真实模板，保存不启动也不部署", async () => {
    const serverDir = path.join(tmpDir, "health-api-server");
    const created = await app.inject({ method: "POST", url: "/api/v1/servers", payload: { configName: "无人配置", serverDir } });
    const uuid = created.json().data.uuid as string;
    const patch = (payload: object) => app.inject({ method: "PATCH", url: `/api/v1/servers/${uuid}/config`, payload });
    expect((await app.inject({ method: "GET", url: "/api/v1/servers/missing/health" })).statusCode).toBe(404);
    const initial = (await app.inject({ method: "GET", url: `/api/v1/servers/${uuid}/health` })).json();
    expect(initial.data).toMatchObject({ state: "stopped", heartbeat: null, onlineCount: null, fps: null, publicReachability: "unverified" });
    expect((await patch({ health: { startupTimeoutSeconds: 119 } })).statusCode).toBe(400);
    const missing = await patch({ health: { enabled: true, unattended: true }, tasks: { missions: [{ template: "Test.Altis" }] } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ error: "INVALID_HEALTH_CONFIG" });
    expect(app.configStore.load(uuid)?.health).toBeUndefined();
    fs.mkdirSync(path.join(serverDir, "mpmissions"), { recursive: true });
    fs.writeFileSync(path.join(serverDir, "mpmissions", "Test.Altis.pbo"), "test");
    expect((await patch({ health: { enabled: true, unattended: true, startupTimeoutSeconds: 120 }, tasks: { missions: [{ template: "Test.Altis" }] }, startup: { autoInit: true }, basic: { persistent: true, noLogs: false } })).statusCode).toBe(200);
    expect(new ConfigStore(tmpDir).load(uuid)?.health).toEqual({ enabled: true, unattended: true, startupTimeoutSeconds: 120 });
    expect(fs.existsSync(path.join(serverDir, "a3st_serverconfig", uuid, "@a3st_health"))).toBe(false);
    expect((await app.inject({ method: "GET", url: `/api/v1/servers/${uuid}/status` })).json().isRunning).toBe(false);
  });
  it("公钥批量部署限于显式扫描路径，空选择不退化为全部，并返回完整证据", async () => {
    const serverDir = path.join(tmpDir, "signature-server");
    const modsDir = path.join(tmpDir, "signature-mods");
    for (const name of ["One", "Two", "Unsigned"]) {
      const addons = path.join(modsDir, name, "addons");
      const keys = path.join(modsDir, name, "keys");
      fs.mkdirSync(addons, { recursive: true });
      fs.mkdirSync(keys, { recursive: true });
      fs.writeFileSync(path.join(addons, "data.pbo"), "pbo");
      if (name !== "Unsigned") fs.writeFileSync(path.join(addons, "data.pbo.author.bisign"), "sign");
      // 常规 Workshop 布局：公钥在 keys/，与列表浅扫一致。
      fs.writeFileSync(path.join(keys, "author.bikey"), name);
    }
    const created = await app.inject({ method: "POST", url: "/api/v1/servers", payload: { configName: "签名范围", serverDir } });
    const uuid = created.json().data.uuid as string;
    const config = app.configStore.load(uuid)!;
    config.mods = { ...config.mods, modPaths: [modsDir], autoCopyBikey: false };
    app.configStore.save(uuid, config);
    const deploy = (modPaths: string[]) => app.inject({ method: "POST", url: "/api/v1/task", payload: { serverUuid: uuid, commands: [{ action: "copy_bikeys", modPaths }] } });
    expect((await deploy([])).json().success).toBe(false);
    expect((await deploy([path.join(tmpDir, "unmanaged")])).json().success).toBe(false);
    expect(fs.existsSync(path.join(serverDir, "Keys", "Two-author.bikey"))).toBe(false);
    const onePath = path.join(modsDir, "One");
    expect((await deploy([onePath, path.join(modsDir, "Unsigned")])).json().success).toBe(true);
    expect(fs.readFileSync(path.join(serverDir, "Keys", "One-author.bikey"), "utf8")).toBe("One");
    expect(fs.existsSync(path.join(serverDir, "Keys", "Two-author.bikey"))).toBe(false);
    expect(fs.existsSync(path.join(serverDir, "Keys", "Unsigned-author.bikey"))).toBe(false);
    const scan = (await app.inject({ method: "GET", url: `/api/v1/servers/${uuid}/mods` })).json();
    expect(scan.data.mods.find((mod: { path: string }) => mod.path === onePath)).toMatchObject({ bikeyStatus: "ready", signatureEvidence: { pboCount: 1, signedPboCount: 1, cryptographicVerified: false } });
  });
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

  it("任务 API 取消排队项不终止运行项；队列繁忙时设置接口不落盘", async () => {
    const inner = app.steamCmd as unknown as { ensureInstalledBody: () => Promise<void> };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const body = vi.spyOn(inner, "ensureInstalledBody").mockImplementation(async () => { await gate; });
    const kill = vi.spyOn(app.steamCmd, "kill");
    const settings = app.steamCmdSettingsStore.load();
    const submit = () => app.inject({ method: "POST", url: "/api/v1/task", payload: { serverUuid: "queue-test", async: true, commands: [{ action: "ensure_steamcmd" }] } });
    try {
      const first = (await submit()).json().data.taskId as string;
      const second = (await submit()).json().data.taskId as string;
      expect(app.steamCmd.pendingCount).toBe(1);
      const change = await app.inject({ method: "PUT", url: "/api/v1/settings/steamcmd", payload: { workshopRoot: path.join(tmpDir, "wrong-target") } });
      expect(change.statusCode).toBe(409);
      expect(app.steamCmdSettingsStore.load()).toEqual(settings);
      const del = await app.inject({ method: "DELETE", url: `/api/v1/tasks/${second}` });
      expect(del.json().data.status).toBe("Cancelled");
      expect(kill).not.toHaveBeenCalled();
      expect(app.steamCmd.pendingCount).toBe(0);
      release();
      await vi.waitFor(() => expect(app.asyncTaskManager.get(first)?.status).toBe("Succeeded"));
      expect(body).toHaveBeenCalledTimes(1);
    } finally { release(); body.mockRestore(); kill.mockRestore(); }
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

  it("SEC-1 sanitizes malicious string processById in PUT/PATCH config without spawning shell", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/servers",
      payload: { configName: "PidInjection", serverDir: tmpDir },
    });
    const uuid = JSON.parse(createRes.payload).data.uuid as string;

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/v1/servers/${uuid}/config`,
      payload: {
        formatVersion: 2,
        server: { configName: "PidInjection", serverDir: tmpDir },
        tasks: { processById: "1); Start-Process calc; #" },
      },
    });
    expect(putRes.statusCode).toBe(200);

    const getRes = await app.inject({ method: "GET", url: `/api/v1/servers/${uuid}/config` });
    expect(JSON.parse(getRes.payload).data.tasks.processById).toBe(0);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/servers/${uuid}/config`,
      payload: { tasks: { processById: "99 && whoami" } },
    });
    expect(patchRes.statusCode).toBe(200);
    const getAfterPatch = await app.inject({ method: "GET", url: `/api/v1/servers/${uuid}/config` });
    expect(JSON.parse(getAfterPatch.payload).data.tasks.processById).toBe(0);
  });

  it("SEC-4 returns 400 INVALID_UUID / INVALID_SNAPSHOT_ID on traversal params and queries", async () => {
    const r1 = await app.inject({ method: "GET", url: "/api/v1/servers/..%5Cescape/config" });
    expect(r1.statusCode).toBe(400);
    expect(JSON.parse(r1.payload).error).toBe("INVALID_UUID");

    const r2 = await app.inject({ method: "DELETE", url: "/api/v1/servers/bad.uuid" });
    expect(r2.statusCode).toBe(400);
    expect(JSON.parse(r2.payload).error).toBe("INVALID_UUID");

    const r3 = await app.inject({
      method: "POST",
      url: "/api/v1/servers/uuid-1/snapshots/..%5Cescape/restore",
    });
    expect(r3.statusCode).toBe(400);
    expect(JSON.parse(r3.payload).error).toBe("INVALID_SNAPSHOT_ID");

    const r4 = await app.inject({
      method: "GET",
      url: "/api/v1/bans?serverUuid=..%2Fetc",
    });
    expect(r4.statusCode).toBe(400);
    expect(JSON.parse(r4.payload).error).toBe("INVALID_UUID");

    const r5 = await app.inject({
      method: "POST",
      url: "/api/v1/task",
      payload: { serverUuid: "../etc", commands: [{ action: "status" }] },
    });
    expect(r5.statusCode).toBe(400);
    expect(JSON.parse(r5.payload).error).toBe("INVALID_UUID");
  });

  it("BUG-3 passes timeMinutes (with RconView legacy numeric playerId fallback) and rconMissionName ?? missionTemplate", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/servers",
      payload: { configName: "RconTest", serverDir: tmpDir },
    });
    const uuid = JSON.parse(createRes.payload).data.uuid as string;
    const putRes = await app.inject({
      method: "PUT",
      url: `/api/v1/servers/${uuid}/config`,
      payload: {
        formatVersion: 2,
        server: { configName: "RconTest", serverDir: tmpDir },
        battleye: { rconPort: 2302, rconPassword: "secret" },
      },
    });
    expect(putRes.statusCode).toBe(200);

    const connectSpy = vi.spyOn(RconClient.prototype, "connect").mockResolvedValue();
    const disconnectSpy = vi.spyOn(RconClient.prototype, "disconnect").mockImplementation(() => {});
    const banSpy = vi
      .spyOn(RconClient.prototype, "ban")
      .mockResolvedValue({ success: true, message: "banned" });
    const missionSpy = vi
      .spyOn(RconClient.prototype, "loadMission")
      .mockResolvedValue({ success: true, message: "loaded" });

    try {
      const taskRes = await app.inject({
        method: "POST",
        url: "/api/v1/task",
        payload: {
          serverUuid: uuid,
          commands: [
            {
              action: "rcon_ban",
              playerGuid: "guid123",
              playerId: "2",
              timeMinutes: 60,
              reason: "TK",
            },
            {
              action: "rcon_ban",
              playerGuid: "guid456",
              playerId: 30,
              reason: "临时封禁",
            },
            {
              action: "rcon_mission",
              rconMissionName: "co10_Escape.Altis",
            },
            {
              action: "rcon_mission",
              missionTemplate: "Altis_Life.Altis",
            },
          ],
        },
      });
      const taskBody = JSON.parse(taskRes.payload) as {
        success: boolean;
        data?: { steps?: { action: string; success: boolean; message: string }[] };
      };
      // 任务被维护锁/配置缺失等提前阻断时，“ban 调用 0 次”无法定位原因；先把步骤暴露出来。
      expect(taskBody.success, `任务失败步骤：${JSON.stringify(taskBody.data?.steps ?? [])}`).toBe(true);

      expect(banSpy).toHaveBeenNthCalledWith(1, "guid123", 60, "TK");
      expect(banSpy).toHaveBeenNthCalledWith(2, "guid456", 30, "临时封禁");
      expect(missionSpy).toHaveBeenNthCalledWith(1, "co10_Escape.Altis");
      expect(missionSpy).toHaveBeenNthCalledWith(2, "Altis_Life.Altis");
    } finally {
      connectSpy.mockRestore();
      disconnectSpy.mockRestore();
      banSpy.mockRestore();
      missionSpy.mockRestore();
    }
  });

  it("PERF-2 /monitoring/collect and /monitoring/sync-players use batch persistence instead of N+1 recordPlayer", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/servers",
      payload: { configName: "CollectTest", serverDir: tmpDir },
    });
    const uuid = JSON.parse(createRes.payload).data.uuid as string;
    await app.inject({
      method: "PUT",
      url: `/api/v1/servers/${uuid}/config`,
      payload: {
        formatVersion: 2,
        server: { configName: "CollectTest", serverDir: tmpDir },
        battleye: { rconPort: 2302, rconPassword: "secret" },
      },
    });

    const connectSpy = vi.spyOn(RconClient.prototype, "connect").mockResolvedValue();
    const disconnectSpy = vi.spyOn(RconClient.prototype, "disconnect").mockImplementation(() => {});
    const playersSpy = vi.spyOn(RconClient.prototype, "getPlayers").mockResolvedValue([
      { num: 1, guid: "pguid-1", name: "Alpha" },
      { num: 2, guid: "pguid-2", name: "Bravo" },
    ]);
    const stateSpy = vi.spyOn(processManager, "getState").mockImplementation(async (id) => ({
      isRunning: id === uuid,
      pid: id === uuid ? 5555 : undefined,
    }));
    const tickSpy = vi.spyOn(monitorDb, "recordCollectionTick");
    const batchSpy = vi.spyOn(monitorDb, "batchInsertPlayers");
    const recordPlayerSpy = vi.spyOn(monitorDb, "recordPlayer");

    try {
      const collectRes = await app.inject({ method: "POST", url: "/api/v1/monitoring/collect" });
      expect(collectRes.statusCode).toBe(200);
      expect(tickSpy).toHaveBeenCalledTimes(1);
      expect(tickSpy).toHaveBeenCalledWith(
        uuid,
        2,
        expect.arrayContaining([
          expect.objectContaining({ playerGuid: "pguid-1", playerName: "Alpha" }),
          expect.objectContaining({ playerGuid: "pguid-2", playerName: "Bravo" }),
        ])
      );
      expect(recordPlayerSpy).not.toHaveBeenCalled();

      const syncRes = await app.inject({
        method: "POST",
        url: `/api/v1/servers/${uuid}/monitoring/sync-players`,
      });
      expect(syncRes.statusCode).toBe(200);
      expect(JSON.parse(syncRes.payload).data.synced).toBe(2);
      expect(batchSpy).toHaveBeenCalledTimes(1);
      expect(recordPlayerSpy).not.toHaveBeenCalled();
      playersSpy.mockRejectedValueOnce(new Error("RCon timeout"));
      const failedCollect = await app.inject({ method: "POST", url: "/api/v1/monitoring/collect" });
      expect(failedCollect.json().data.collected).toBe(0);
      expect(tickSpy).toHaveBeenCalledTimes(1);
    } finally {
      connectSpy.mockRestore();
      disconnectSpy.mockRestore();
      playersSpy.mockRestore();
      stateSpy.mockRestore();
      tickSpy.mockRestore();
      batchSpy.mockRestore();
      recordPlayerSpy.mockRestore();
    }
  });

  it("BUG-6 PUT /servers/:uuid/rename updates both manifest and config.server.configName and rejects blank names", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/servers",
      payload: { configName: "OldName", serverDir: tmpDir },
    });
    const uuid = JSON.parse(createRes.payload).data.uuid as string;

    const badRename = await app.inject({
      method: "PUT",
      url: `/api/v1/servers/${uuid}/rename`,
      payload: { newName: "   " },
    });
    expect(badRename.statusCode).toBe(400);

    const renameRes = await app.inject({
      method: "PUT",
      url: `/api/v1/servers/${uuid}/rename`,
      payload: { newName: "NewName" },
    });
    expect(renameRes.statusCode).toBe(200);

    const listRes = await app.inject({ method: "GET", url: "/api/v1/servers" });
    const list = JSON.parse(listRes.payload) as { uuid: string; configName: string }[];
    expect(list.find((s) => s.uuid === uuid)?.configName).toBe("NewName");

    const cfgRes = await app.inject({ method: "GET", url: `/api/v1/servers/${uuid}/config` });
    expect(JSON.parse(cfgRes.payload).data.server.configName).toBe("NewName");
  });

  it("BUG-14 bounds tail/hours query params and returns HTTP 404 on NOT_FOUND endpoints", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/servers",
      payload: { configName: "Bug14", serverDir: tmpDir },
    });
    const uuid = JSON.parse(createRes.payload).data.uuid as string;
    const logDir = path.join(tmpDir, "a3st_serverconfig", uuid);
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(
      path.join(logDir, "server.rpt"),
      ["l1", "l2", "l3"].join("\n"),
      "utf-8"
    );

    const logBadTail = await app.inject({
      method: "GET",
      url: `/api/v1/servers/${uuid}/logs/read?kind=rpt&tail=abc`,
    });
    expect(logBadTail.statusCode).toBe(200);
    expect(JSON.parse(logBadTail.payload).data.lines).toEqual(["l1", "l2", "l3"]);

    const steamLogBadTail = await app.inject({
      method: "GET",
      url: "/api/v1/steamcmd/log?tail=-10",
    });
    expect(steamLogBadTail.statusCode).toBe(200);

    monitorDb.recordStats(uuid, 7);
    const statsBadHours = await app.inject({
      method: "GET",
      url: `/api/v1/servers/${uuid}/monitoring/stats?hours=abc`,
    });
    expect(statsBadHours.statusCode).toBe(200);
    expect(JSON.parse(statsBadHours.payload).data.stats).toHaveLength(1);

    const statsZeroHours = await app.inject({
      method: "GET",
      url: `/api/v1/servers/${uuid}/monitoring/stats?hours=-5`,
    });
    expect(statsZeroHours.statusCode).toBe(200);
    expect(JSON.parse(statsZeroHours.payload).data.stats).toHaveLength(1);

    const notFoundCalls = [
      { method: "GET" as const, url: "/api/v1/servers/missing-id/config" },
      { method: "GET" as const, url: "/api/v1/servers/missing-id/preflight" },
      { method: "GET" as const, url: "/api/v1/servers/missing-id/dashboard" },
      {
        method: "POST" as const,
        url: "/api/v1/schedule/restart",
        payload: { serverUuid: "missing-id", cron: "0 4 * * *" },
      },
      {
        method: "POST" as const,
        url: `/api/v1/servers/${uuid}/snapshots/missing-snap/restore`,
      },
      { method: "GET" as const, url: "/api/v1/tasks/missing-task" },
    ];
    for (const reqOpts of notFoundCalls) {
      const r = await app.inject(reqOpts);
      expect(r.statusCode).toBe(404);
      const body = JSON.parse(r.payload);
      expect(body.success).toBe(false);
      expect(body.error).toBe("NOT_FOUND");
    }
  });

  it("BUG-5 & BUG-7 via createService: accepts text/html, rejects JSON body 400, and writes server.cfg on mission-pbo?writeCfg=true", { timeout: 30_000 }, async () => {
    const svcDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-svc-upload-"));
    const svc = await createService({ port: 0, host: "127.0.0.1", dataDir: svcDir });
    try {
      const addr = svc.server.address();
      if (!addr || typeof addr === "string") {
        throw new Error("expected TCP address");
      }
      const baseUrl = `http://127.0.0.1:${addr.port}`;

      const createRes = await fetch(`${baseUrl}/api/v1/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configName: "UploadSvc", serverDir: svcDir }),
      });
      const uuid = ((await createRes.json()) as { data: { uuid: string } }).data.uuid;

      // BUG-5: text/html accepted cleanly
      const htmlRes = await fetch(
        `${baseUrl}/api/v1/servers/${uuid}/files/mod-list-html?mode=merge_enable`,
        {
          method: "POST",
          headers: { "Content-Type": "text/html" },
          body: '<a href="https://steamcommunity.com/sharedfiles/filedetails/?id=450814997">CBA</a>',
        }
      );
      expect(htmlRes.status).toBe(200);
      const htmlBody = (await htmlRes.json()) as { success: boolean; data: { modCount: number } };
      expect(htmlBody.success).toBe(true);
      expect(htmlBody.data.modCount).toBe(1);

      // BUG-5: JSON object body returns 400 NO_CONTENT (never 500 TypeError)
      const badBodyRes = await fetch(
        `${baseUrl}/api/v1/servers/${uuid}/files/mod-list-html`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bad: true }),
        }
      );
      expect(badBodyRes.status).toBe(400);
      const badBody = (await badBodyRes.json()) as { success: boolean; error: string };
      expect(badBody.success).toBe(false);
      expect(badBody.error).toBe("NO_CONTENT");

      // BUG-7: multipart mission-pbo with addToMissionList=true&writeCfg=true
      const form = new FormData();
      form.append(
        "file",
        new Blob([Buffer.from("fake-pbo-content")], { type: "application/octet-stream" }),
        "TestMission.Altis.pbo"
      );
      const pboRes = await fetch(
        `${baseUrl}/api/v1/servers/${uuid}/files/mission-pbo?addToMissionList=true&writeCfg=true`,
        { method: "POST", body: form }
      );
      expect(pboRes.status).toBe(200);
      const pboBody = (await pboRes.json()) as {
        success: boolean;
        data: { cfgWritten: boolean };
      };
      expect(pboBody.success).toBe(true);
      expect(pboBody.data.cfgWritten).toBe(true);

      const pboPath = path.join(svcDir, "MPMissions", "TestMission.Altis.pbo");
      expect(fs.existsSync(pboPath)).toBe(true);
      const cfgPath = path.join(svcDir, "a3st_serverconfig", uuid, "server.cfg");
      expect(fs.existsSync(cfgPath)).toBe(true);
      expect(fs.readFileSync(cfgPath, "utf-8")).toContain("TestMission.Altis");
    } finally {
      await svc.close();
      fs.rmSync(svcDir, { recursive: true, force: true });
    }
  });
});
