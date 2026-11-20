import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import { createService } from "../app.js";
import type { OperationEventInput } from "../types/operations.js";
import type { ServerHealthData } from "../types/health.js";
import { observeDownload, recordSignatureEvents } from "./source-events.js";
import { getServerKeysDirectory } from "../mods/bikey-service.js";
import { MaintenancePlanner } from "../maintenance/planner.js";

let dir: string;
let app: Awaited<ReturnType<typeof createService>>;
let logs: string[];
const readHeaders = { authorization: "Bearer unit-readonly-token" };
const adminHeaders = { authorization: "Bearer unit-admin-token" };
const input: OperationEventInput = { type: "health_unhealthy", severity: "critical", serverUuids: ["srv-1"], modIds: [], batchId: null,
  reasonCode: "HEALTH_UNHEALTHY", message: "unit-admin-token unit-readonly-token smtp-unit-secret", suggestedAction: "检查心跳", requiresAttention: true };
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-ops-api-")); logs = [];
  vi.stubEnv("A3ST_SMTP_PASSWORD", "smtp-unit-secret");
  app = await createService({ port: 0, host: "127.0.0.1", dataDir: dir, apiToken: "unit-admin-token", opsReadToken: "unit-readonly-token",
    logStream: new Writable({ write(chunk, _enc, done) { logs.push(String(chunk)); done(); } }) });
});
afterEach(async () => { await app?.close(); fs.rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("只读运维 API", () => {
  it("只允许三个 GET，拒绝 URL 凭据、写入、HEAD、日志和配置", async () => {
    const event = app.operations.record(input);
    app.operations.checkpoint({ id: "batch", state: "failed", createdAt: "now", updatedAt: "now", serverUuids: ["srv-1"], modIds: [1], requiresAttention: true, result: "需要恢复", recovery: { password: "internal-only", backupPath: "internal-path" } });
    expect((await app.inject({ url: "/api/v1/ops/events", headers: readHeaders })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/v1/servers/missing/health", headers: readHeaders })).statusCode).toBe(404);
    const maintenance = await app.inject({ url: "/api/v1/ops/maintenance/batch", headers: { "x-api-key": "unit-readonly-token" } });
    expect(maintenance.json().data.state).toBe("failed"); expect(maintenance.body).not.toContain("internal");
    for (const url of ["/api/v1/servers", "/api/v1/servers/srv-1/config", "/api/v1/servers/srv-1/logs", "/api/v1/ops/notifications/settings", "/api/v1/ops/notifications/deliveries"]) {
      expect((await app.inject({ url, headers: readHeaders })).statusCode).toBe(403);
    }
    for (const method of ["POST", "PUT", "DELETE", "HEAD"] as const) {
      expect((await app.inject({ method, url: "/api/v1/ops/events", headers: readHeaders })).statusCode).toBe(403);
    }
    for (const headers of [{}, readHeaders]) expect((await app.inject({ url: "/api/v1/ops/events?token=unit-readonly-token", headers })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `/api/v1/ops/events/${event.eventId}/acknowledge`, headers: readHeaders })).statusCode).toBe(403);
    const ack = await app.inject({ method: "POST", url: `/api/v1/ops/events/${event.eventId}/acknowledge`, headers: adminHeaders });
    expect(ack.json().data.acknowledgedAt).not.toBeNull(); expect(ack.json().data.recoveredAt).toBeNull();
    expect(logs.join("")).not.toContain("unit-readonly-token");
  });
  it("未配置管理 Token 时，只读凭据不能退化获得本机权限；公网仍只允许读取", async () => {
    app.serviceOptions.apiToken = undefined;
    expect((await app.inject({ method: "POST", url: "/api/v1/task", headers: readHeaders })).statusCode).toBe(403);
    // 只变更鉴权配置，不把测试端口暴露到公网。
    app.serviceOptions.host = "0.0.0.0";
    expect((await app.inject({ url: "/api/v1/ops/events", headers: readHeaders })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/v1/servers" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/v1/servers", headers: readHeaders })).statusCode).toBe(403);
  });
  it("维护发现与预览仅管理端可用，复用任务入口且拒绝附带重启；真实 ACF 独立证据不暴露 argv", async () => {
    const root = path.join(dir, "library"); const workshop = path.join(root, "steamapps", "workshop");
    const mod = path.join(workshop, "content", "107410", "123456789");
    fs.mkdirSync(path.join(mod, "addons"), { recursive: true });
    fs.writeFileSync(path.join(mod, "meta.cpp"), 'publishedid = 123456789; name = "UnitMod";');
    fs.writeFileSync(path.join(workshop, "appworkshop_107410.acf"), '"AppWorkshop" { "appid" "107410" "WorkshopItemsInstalled" { "123456789" { "manifest" "100" "size" "1000" "timeupdated" "1700000000" } } }');
    app.steamCmd.setWorkshopRoot(root);
    app.steamCmdSettingsStore.merge({ workshopRoot: root });
    app.configStore.save("srv-1", { formatVersion: 2, server: { serverDir: path.join(dir, "server") }, mods: { enabledIds: [123456789], clientModIds: [123456789] } });
    const download = vi.spyOn(app.steamCmd, "downloadWorkshopMods"); const install = vi.spyOn(app.steamCmd, "ensureInstalled"); const start = vi.spyOn(app.processManager, "start");
    await app.maintenancePlanner.close();
    const planner = new MaintenancePlanner(app, {
      remote: async () => [{ modId: 123456789, title: "UnitMod", description: "", fileSizeMb: "", fileSizeBytes: 1000, selected: true, source: "api", timeUpdated: 1700000002 }],
      runtime: async () => ({ snapshots: [{ serverUuid: "srv-1", kind: "server", workingDirectory: dir, args: [`-mod=${mod}`, "-password=internal-only"] }],
        instances: [{ serverUuid: "srv-1", server: null, headless: null, serverRunning: false, headlessRunning: false }], issues: [], unmanagedUuids: [] }),
    });
    app.maintenancePlanner = planner;
    try {
      const base = "/api/v1/servers/srv-1/maintenance";
      for (const [method, endpoint] of [["GET", "updates"], ["POST", "check"], ["POST", "preview"]] as const) expect((await app.inject({ method, url: `${base}/${endpoint}`, headers: readHeaders })).statusCode).toBe(403);
      const checked = await app.inject({ method: "POST", url: `${base}/check`, headers: adminHeaders });
      expect(checked.json().data).toHaveLength(1); const item = checked.json().data[0];
      expect(item).toMatchObject({ status: "outdated", localVersion: { manifest: "100" } });
      const preview = await app.inject({ method: "POST", url: `${base}/preview`, headers: adminHeaders, payload: { keys: [item.key] } });
      expect(preview.json().data).toMatchObject({ canExecute: false, instances: [{ eligibility: { reasonCode: "POLICY_DISABLED" } }] });
      expect(preview.body).not.toContain("internal-only");
      for (const payload of [{ keys: [] }, { keys: [item.key], bypass: true }, { keys: ["a".repeat(64)] }]) expect((await app.inject({ method: "POST", url: `${base}/preview`, headers: adminHeaders, payload })).statusCode).toBe(400);
      const task = await app.inject({ method: "POST", url: "/api/v1/task", headers: adminHeaders, payload: { serverUuid: "srv-1", commands: [{ action: "maintenance_preview", keys: [item.key] }] } });
      expect(task.json().success).toBe(true);
      const refused = await app.inject({ method: "POST", url: "/api/v1/task", headers: adminHeaders, payload: { serverUuid: "srv-1", restartAfter: true, commands: [{ action: "maintenance_check" }] } });
      expect(refused.json().success).toBe(false); expect(refused.body).toContain("不允许附带");
      expect(download).not.toHaveBeenCalled(); expect(install).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
    } finally { await planner.close(); }
  });
  it("相同管理和只读 Token 在监听前拒绝", async () => {
    await expect(createService({ port: 0, host: "127.0.0.1", dataDir: dir, apiToken: "same", opsReadToken: "same" })).rejects.toThrow("必须与管理 Token 不同");
  });
  it("事件分页、恢复补拉、非法和过期游标、重新同步；秘密不外泄", async () => {
    const first = app.operations.record(input); app.operations.resolve(first.eventId);
    app.operations.record({ ...input, reasonCode: "ANOTHER" });
    const page = (await app.inject({ url: "/api/v1/ops/events?after=0&limit=1", headers: readHeaders })).json().data;
    expect(page.items).toHaveLength(1); expect(page.hasMore).toBe(true);
    const next = (await app.inject({ url: `/api/v1/ops/events?after=${page.nextCursor}`, headers: readHeaders })).json().data;
    expect(next.items[0].change).toBe("recovered"); expect(next.items).toHaveLength(2);
    for (const query of ["after=-1", "after=NaN", "after=99999", "after=1.2", "limit=0", "limit=101", "after=999999999999999999999"]) {
      expect((await app.inject({ url: `/api/v1/ops/events?${query}`, headers: readHeaders })).statusCode).toBe(400);
    }
    const all = (await app.inject({ url: "/api/v1/ops/events", headers: readHeaders })).body;
    for (const secret of ["unit-admin-token", "unit-readonly-token", "smtp-unit-secret"]) expect(all).not.toContain(secret);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 86400000);
    app.operations.prune();
    const expired = await app.inject({ url: "/api/v1/ops/events?after=0", headers: readHeaders });
    expect(expired.statusCode).toBe(410); expect(expired.json().error).toBe("CURSOR_EXPIRED");
    const sync = (await app.inject({ url: `/api/v1/ops/events?after=${expired.json().data.earliestCursor}`, headers: readHeaders })).json().data;
    expect(sync.items).toHaveLength(1); expect(sync.items[0].reasonCode).toBe("ANOTHER");
  });
  it("通知设置仅返回密码配置状态；测试邮件需完整设置，未知字段拒绝", async () => {
    const get = await app.inject({ url: "/api/v1/ops/notifications/settings", headers: adminHeaders });
    expect(get.json().data).toMatchObject({ enabled: false, passwordConfigured: true, readTokenConfigured: true });
    expect(get.body).not.toContain("smtp-unit-secret");
    expect((await app.inject({ method: "POST", url: "/api/v1/ops/notifications/test", headers: adminHeaders })).statusCode).toBe(400);
    const settings = { enabled: false, host: "127.0.0.1", port: 1, tls: "starttls", username: "", from: "ops@example.test", recipients: ["admin@example.test"] };
    expect((await app.inject({ method: "PUT", url: "/api/v1/ops/notifications/settings", headers: adminHeaders, payload: { ...settings, password: "do-not-store" } })).statusCode).toBe(400);
    const save = await app.inject({ method: "PUT", url: "/api/v1/ops/notifications/settings", headers: adminHeaders, payload: settings });
    expect(save.statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/v1/ops/notifications/test", headers: adminHeaders })).statusCode).toBe(202);
    expect((await app.inject({ url: "/api/v1/ops/notifications/deliveries", headers: adminHeaders })).json().data).toHaveLength(1);
    expect(fs.readFileSync(app.operations.filePath).includes(Buffer.from("do-not-store"))).toBe(false);
  });
  it("下载认证/失败事件去重且不写原始错误，成功仅恢复相同作用范围", async () => {
    const scope = { serverUuids: ["srv-1"], modIds: [2, 1] };
    const failure = new Error("原始错误含未登记的秘密，不应进入事件");
    const operation = async () => { throw failure; };
    const credentials = vi.spyOn(app.steamCmd, "hasCredentials", "get").mockReturnValue(false);
    const auth = vi.spyOn(app.steamCmd, "authState", "get").mockReturnValue("waiting_guard");
    await expect(observeDownload(app, scope, operation)).rejects.toBe(failure);
    await expect(observeDownload(app, scope, operation)).rejects.toBe(failure);
    expect(app.operations.events().items).toHaveLength(1);
    expect(app.operations.activeEvents()[0]?.type).toBe("authentication_required");
    expect(JSON.stringify(app.operations.events())).not.toContain(failure.message);
    credentials.mockReturnValue(true); auth.mockReturnValue("authenticated");
    await expect(observeDownload(app, scope, operation)).rejects.toBe(failure);
    await expect(observeDownload(app, { ...scope, serverUuids: ["srv-2"] }, operation)).rejects.toBe(failure);
    await expect(observeDownload(app, { ...scope, batchId: "other" }, operation)).rejects.toBe(failure);
    await observeDownload(app, { ...scope, modIds: [1] }, async () => true);
    expect(app.operations.activeEvents()).toHaveLength(4);
    await expect(observeDownload(app, { ...scope, modIds: [1, 2, 2] }, async () => "完成下载")).resolves.toBe("完成下载");
    expect(app.operations.activeEvents()).toHaveLength(2);
    expect(app.operations.activeEvents().every((event) => event.serverUuids[0] === "srv-2" || event.batchId === "other")).toBe(true);
    expect(app.operations.events().items.some((event) => event.type === "update_completed")).toBe(false);
  });
  it("真实文件扫描接入事件 API：重复去重、未知/缺席不恢复、公钥匹配才恢复本服", async () => {
    const mod = path.join(dir, "@TestMod"); const server = path.join(dir, "server");
    const write = (name: string, content: string) => { const file = path.join(mod, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
    write("meta.cpp", "publishedid = 123456789;"); write("addons/data.pbo", "pbo");
    app.configStore.save("srv-1", { formatVersion: 2, server: { serverDir: server }, mods: { localMods: [{ path: mod, enabled: true, isClientMod: true, isServerMod: false }] } });
    const scan = () => app.inject({ url: "/api/v1/servers/srv-1/mods", headers: adminHeaders });
    expect((await scan()).json().data.mods[0].bikeyStatus).toBe("unsigned");
    await app.inject({ url: "/api/v1/servers/srv-1/mods/bikeys", headers: adminHeaders });
    expect(app.operations.events().items).toHaveLength(1);
    const row = (await scan()).json().data.mods[0];
    recordSignatureEvents(app, "srv-2", [{ ...row, isClientMod: false, isServerMod: true }]);
    expect(app.operations.activeEvents().find((item) => item.serverUuids[0] === "srv-2")).toMatchObject({ requiresAttention: false, severity: "info" });
    recordSignatureEvents(app, "srv-1", []);
    recordSignatureEvents(app, "srv-1", [{ ...row, bikeyStatus: "unknown", signatureEvidence: undefined }]);
    expect(app.operations.activeEvents()).toHaveLength(2);
    write("addons/data.pbo.author.bisign", "sign"); write("keys/author.bikey", "key");
    fs.mkdirSync(getServerKeysDirectory(server), { recursive: true });
    fs.writeFileSync(path.join(getServerKeysDirectory(server), "author.bikey"), "different");
    expect((await scan()).json().data.mods[0].bikeyStatus).toBe("key_mismatch");
    fs.writeFileSync(path.join(getServerKeysDirectory(server), "author.bikey"), "key");
    expect((await scan()).json().data.mods[0].bikeyStatus).toBe("ready");
    expect(app.operations.activeEvents()).toHaveLength(1);
    expect(app.operations.activeEvents()[0]?.serverUuids).toEqual(["srv-2"]);
    const events = (await app.inject({ url: "/api/v1/ops/events", headers: readHeaders })).json().data.items;
    expect(events.at(-1)).toMatchObject({ type: "signature_degraded", change: "recovered", serverUuids: ["srv-1"] });
  });
  it("健康每次采样聚合；停止/维护不视为恢复，持久化失败下次重试且关闭解绑", async () => {
    const sample: ServerHealthData = { serverUuid: "srv-1", state: "unhealthy", checkedAt: new Date().toISOString(), sessionStartedAt: null,
      pid: 1, processAlive: true, rconResponsive: false, onlineCount: null, fps: null, heartbeat: null, consecutiveHeartbeats: 0,
      rptPath: null, reasons: ["无心跳"], configurationIssues: [], thresholds: { heartbeatSeconds: 15, sampleSeconds: 10, staleSeconds: 90, startupTimeoutSeconds: 600 }, publicReachability: "unverified", playerJoin: "unverified" };
    const record = vi.spyOn(app.operations, "record").mockImplementationOnce(() => { throw new Error("磁盘错误"); });
    app.serverHealth.emit("sample", sample);
    expect(app.operations.events().items).toHaveLength(0);
    app.serverHealth.emit("sample", sample); app.serverHealth.emit("sample", sample);
    expect(app.operations.events().items).toHaveLength(1);
    for (const state of ["stopped", "maintenance", "unverified"]) app.serverHealth.emit("sample", { ...sample, state });
    app.serverHealth.emit("sample", { ...sample, serverUuid: "srv-2", state: "maintenance", processAlive: null });
    expect(app.operations.activeEvents()).toHaveLength(1);
    const resolve = vi.spyOn(app.operations, "resolve").mockImplementationOnce(() => { throw new Error("磁盘错误"); });
    app.serverHealth.emit("sample", { ...sample, state: "healthy" });
    expect(app.operations.activeEvents()).toHaveLength(1);
    app.serverHealth.emit("sample", { ...sample, state: "healthy" });
    expect(app.operations.activeEvents()).toHaveLength(0); expect(app.operations.events().items.at(-1)?.change).toBe("recovered");
    await app.close(); record.mockClear(); resolve.mockClear();
    app.serverHealth.emit("sample", sample);
    expect(record).not.toHaveBeenCalled(); expect(resolve).not.toHaveBeenCalled();
  });
});
