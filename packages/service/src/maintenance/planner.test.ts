import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ModMeta } from "../types/mods.js";
import type { ServerConfigPackage } from "../types/config.js";
import type { SteamWorkshopModInfo } from "../steamcmd/workshop-api.js";
import type { CollectedMaintenanceRuntime } from "./runtime.js";
import { ConfigStore } from "../config/store.js";
import { OperationsStore } from "../operations/store.js";
import { stringifyWorkshopKeyValues } from "../steamcmd/workshop-acf.js";
import { MaintenancePlanner } from "./planner.js";
import { defaultMaintenancePolicy } from "./policy.js";

let root: string; let now: number; let app: FastifyInstance; let planner: MaintenancePlanner;
let runtime: CollectedMaintenanceRuntime; let scans: Map<string, ModMeta[]>;
let remote: ReturnType<typeof vi.fn<(ids: number[]) => Promise<SteamWorkshopModInfo[]>>>;
let online: ReturnType<typeof vi.fn<(config: ServerConfigPackage) => Promise<number | null>>>;
function library(name: string, time: number) {
  const workshop = path.join(root, name, "steamapps", "workshop"); const mod = path.join(workshop, "content", "107410", "123");
  fs.mkdirSync(mod, { recursive: true });
  fs.writeFileSync(path.join(workshop, "appworkshop_107410.acf"), stringifyWorkshopKeyValues({ AppWorkshop: { appid: "107410", WorkshopItemsInstalled: { "123": { manifest: String(time), timeupdated: String(time), size: "1000" } } } }));
  return mod;
}
function add(uuid: string, mod: string, enabled = true) {
  app.configStore.save(uuid, { formatVersion: 2, server: { serverDir: path.join(root, uuid) }, health: { enabled: true }, maintenance: { ...defaultMaintenancePolicy(), enabled, template: "maintenance_window", windowConfirmed: true } });
  scans.set(uuid, [{ workshopId: 123, name: "测试模组", path: mod, dirName: "123", enabled: true, isClientMod: true, isServerMod: false, scanOrder: 1 }]);
  runtime.instances.push({ serverUuid: uuid, server: null, headless: null, serverRunning: false, headlessRunning: false });
  runtime.snapshots.push({ serverUuid: uuid, kind: "server", workingDirectory: root, args: [`-mod=${mod}`] });
}
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-planner-")); now = Date.parse("2026-01-01T04:30:00Z");
  const operations = new OperationsStore(root, () => now); await operations.waitReady();
  app = { operations, configStore: new ConfigStore(root), steamCmd: { workshopRoot: path.join(root, "library") }, log: { error: vi.fn() } } as unknown as FastifyInstance;
  runtime = { snapshots: [], instances: [], issues: [], unmanagedUuids: [] }; scans = new Map();
  remote = vi.fn(async (ids: number[]) => ids.map((modId) => ({ modId, title: "远程模组", description: "", fileSizeMb: "", selected: true, source: "api" as const, timeUpdated: 1700000002, fileSizeBytes: 1000 })));
  online = vi.fn(async () => 0);
  planner = new MaintenancePlanner(app, { now: () => now, scan: (c: ServerConfigPackage) => scans.get(path.basename(c.server!.serverDir!)) ?? [], runtime: async () => runtime, remote, online });
});
afterEach(async () => { await planner.close(); app.operations.close(); fs.rmSync(root, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe("维护发现与预览", () => {
  it("共享 ID 远程查询一次、物理副本分别比较；并发检查和十分钟缓存不重复请求", async () => {
    const shared = library("library", 1700000000); const copy = library("copy", 1700000002);
    add("s1", shared); add("s2", shared); add("s3", copy);
    const [first] = await Promise.all([planner.checkUpdates("s1"), planner.checkUpdates("s2"), planner.checkUpdates("s3")]);
    expect(remote).toHaveBeenCalledTimes(1); expect(remote).toHaveBeenCalledWith([123]);
    expect(first[0]).toMatchObject({ status: "outdated", configuredUuids: ["s1", "s2"], pendingSince: new Date(now).toISOString() });
    expect(planner.list("s3")[0]).toMatchObject({ status: "up_to_date", pendingSince: null });
    expect(app.operations.discoveries()).toHaveLength(2);
    now += 600000; await planner.checkUpdates(); expect(remote).toHaveBeenCalledTimes(2);
  });
  it("共同策略门禁只约束真实共享实例，同 ID 独立副本不误停；预览不返回 argv", async () => {
    const shared = library("library", 1700000000); add("s1", shared); add("s2", shared); add("s3", library("copy", 1700000000), false);
    const [item] = await planner.checkUpdates("s1");
    const result = await planner.preview("s1", [item.key]);
    expect(result).toMatchObject({ canExecute: true, impact: { serverUuids: ["s1", "s2"], resources: [{ modIds: [123] }] } });
    expect(result.instances.every((value) => value.presence.running === false)).toBe(true);
    expect(result.warning).toContain("下载耗时计入停服"); expect(JSON.stringify(result)).not.toContain('"args"');
    const config = app.configStore.load("s2")!; config.maintenance!.enabled = false; app.configStore.save("s2", config);
    const waiting = await planner.preview("s1", [item.key]);
    expect(waiting.canExecute).toBe(false); expect(waiting.instances[1].eligibility.reasonCode).toBe("POLICY_DISABLED");
    expect(app.operations.activeEvents()[0]?.type).toBe("shared_window_conflict");
    await planner.preview("s1", [item.key]); expect(app.operations.activeEvents()).toHaveLength(1);
    config.maintenance!.enabled = true; app.configStore.save("s2", config);
    await planner.preview("s1", [item.key]); expect(app.operations.activeEvents()).toHaveLength(0);
  });
  it("十分钟无人链需要连续采样；未知和会话变化重置，不用零人替代失败", async () => {
    add("s1", library("library", 1700000000));
    const instance = runtime.instances[0]; instance.serverRunning = true;
    instance.server = { pid: 123, executable: "internal", workingDirectory: root, args: ["-password=not-public"], session: "one" };
    const [item] = await planner.checkUpdates("s1");
    expect((await planner.preview("s1", [item.key])).instances[0].eligibility.reasonCode).toBe("WAITING_IDLE");
    for (let index = 0; index < 60; index++) { now += 10000; await planner.sample(); }
    expect((await planner.preview("s1", [item.key])).canExecute).toBe(true);
    online.mockResolvedValueOnce(null);
    const unknown = await planner.preview("s1", [item.key]);
    expect(unknown.instances[0]).toMatchObject({ presence: { onlineCount: null, idleSince: null }, eligibility: { reasonCode: "ONLINE_UNKNOWN" } });
    instance.server.session = "two";
    expect((await planner.preview("s1", [item.key])).instances[0].eligibility.reasonCode).toBe("WAITING_IDLE");
    expect(JSON.stringify(unknown)).not.toContain("not-public");
  });
  it("未知远程不当最新且保留首次待处理时间，重启仍能恢复 24 小时依据", async () => {
    add("s1", library("library", 1700000000));
    const [first] = await planner.checkUpdates("s1");
    now += 86400000; remote.mockRejectedValueOnce(new Error("network"));
    const [unknown] = await planner.checkUpdates("s1");
    expect(unknown).toMatchObject({ status: "unknown", remoteVersion: null, pendingSince: first.pendingSince });
    app.operations.close(); app.operations = new OperationsStore(root, () => now); await app.operations.waitReady();
    expect(app.operations.discoveries()[0].pendingSince).toBe(first.pendingSince);
    now += 600000; library("library", 1700000002);
    expect((await planner.checkUpdates("s1"))[0]).toMatchObject({ status: "up_to_date", pendingSince: null });
  });
  it("显式选择检查范围；独立副本不能误用全局 SteamCMD 更新位置", async () => {
    add("s1", library("copy", 1700000000));
    const [item] = await planner.checkUpdates("s1");
    const result = await planner.preview("s1", [item.key]);
    expect(result.canExecute).toBe(false); expect(result.reasons.join(" ")).toContain("物理写入目标");
    await expect(planner.preview("s1", [])).rejects.toThrow("显式选择");
    await expect(planner.preview("s1", [item.key, item.key])).rejects.toThrow("不重复");
    await expect(planner.preview("s1", ["a".repeat(64)])).rejects.toThrow("失效");
    scans.set("s1", []); expect(planner.list("s1")).toEqual([]);
  });
  it("关闭等待远程检查落盘，关闭后拒绝新检查；没有策略授权不自动发起查询", async () => {
    add("s1", library("library", 1700000000), false);
    planner.start(); await Promise.resolve(); expect(remote).not.toHaveBeenCalled();
    let resolve!: (value: []) => void;
    remote.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const check = planner.checkUpdates("s1"); let closed = false;
    const closing = planner.close().then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false);
    resolve([]); await check; await closing;
    expect(app.operations.discoveries()).toHaveLength(1);
    await expect(planner.checkUpdates("s1")).rejects.toThrow("关闭");
  });
});
