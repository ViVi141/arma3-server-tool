import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as asyncFs from "node:fs/promises";
vi.mock("node:fs/promises", async (original) => ({ ...await original<typeof import("node:fs/promises")>() }));
import * as os from "node:os";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ServerHealthData } from "../types/health.js";
import { ConfigStore } from "../config/store.js";
import { buildStartCommandLine, buildHeadlessClientCommandLine, getServerExecutablePath, getConfigRoot, splitCommandLine, writeAll } from "../config/game-config-writer.js";
import { ModScanner } from "../mods/scanner.js";
import { ModScanPathStore } from "../mods/scan-path-store.js";
import { SteamCmdSettingsStore } from "../settings/steamcmd-settings.js";
import { scanModsForConfig } from "../mods/mod-config-sync.js";
import { OperationsStore } from "../operations/store.js";
import type { ProcessRuntime } from "../process/runtime.js";
import { parseWorkshopKeyValues, stringifyWorkshopKeyValues, workshopSection } from "../steamcmd/workshop-acf.js";
import type { MaintenanceSteamSession } from "../steamcmd/manager.js";
import { ServiceMaintenanceAdapter } from "./adapter.js";
import { MaintenanceExecutor, type MaintenanceExecutionPlan, type MaintenanceProcessReceipt } from "./executor.js";
import type { BackupReference } from "./backup.js";
import { MaintenancePlanner } from "./planner.js";
import { defaultMaintenancePolicy } from "./policy.js";
import type { CollectedMaintenanceRuntime } from "./runtime.js";
import { physicalLockPath } from "./locks.js";

// 真实文件、检查点与多次健康轮询在并行跑全量测试时明显慢于默认 5s；超时会让后台执行继续持有全局维护锁。
vi.setConfig({ testTimeout: 30_000 });

let dir: string, library: string, mod: string, acf: string, now: number, pid: number;
let app: FastifyInstance, adapter: ServiceMaintenanceAdapter, planner: MaintenancePlanner;
let live: Map<string, ProcessRuntime>, unknown: boolean;
let stop: ReturnType<typeof vi.fn<(value: MaintenanceProcessReceipt) => Promise<void>>>;
let start: ReturnType<typeof vi.fn<(uuid: string, kind: "server" | "headless") => Promise<number>>>;
let health: ReturnType<typeof vi.fn<(uuid: string) => Promise<unknown>>>;
let download: ReturnType<typeof vi.fn<(ids: number[]) => Promise<void>>>;
let authenticate: ReturnType<typeof vi.fn<() => Promise<void>>>;
const key = (uuid: string, name = "a") => path.join(dir, uuid, "Keys", `123-${name}.bikey`);
function writeVersion(time = 1700000000, other = "2") {
  fs.writeFileSync(acf, stringifyWorkshopKeyValues({ AppWorkshop: { appid: "107410", WorkshopItemsInstalled: {
    "123": { manifest: String(time), timeupdated: String(time), size: "1000" }, "456": { manifest: other, timeupdated: "1700000000", size: "50" },
  } } }));
}
function launch(uuid: string, kind: "server" | "headless", processId: number): ProcessRuntime {
  const config = app.configStore.load(uuid)!;
  const mods = scanModsForConfig(app, config, { skipSize: true });
  return { pid: processId, session: `birth-${processId}`, workingDirectory: config.server!.serverDir!, executable: getServerExecutablePath(config),
    args: splitCommandLine(kind === "server" ? buildStartCommandLine(uuid, config, mods) : buildHeadlessClientCommandLine(uuid, config, mods)) };
}
async function runtime(): Promise<CollectedMaintenanceRuntime> {
  const result: CollectedMaintenanceRuntime = { instances: [], snapshots: [], issues: unknown ? [{ code: "RUNTIME_UNKNOWN", serverUuid: null, path: null, reason: "注入 OS 查询失败" }] : [], unmanagedUuids: [] };
  for (const { uuid } of app.configStore.listServers()) {
    const server = live.get(`${uuid}:server`) ?? null, headless = live.get(`${uuid}:headless`) ?? null;
    result.instances.push({ serverUuid: uuid, server, headless, serverRunning: !!server, headlessRunning: !!headless });
    for (const kind of ["server", "headless"] as const) {
      const process = live.get(`${uuid}:${kind}`);
      if (process) result.snapshots.push({ serverUuid: uuid, kind, args: process.args, workingDirectory: process.workingDirectory });
      if (kind === "server" || app.configStore.load(uuid)?.tasks?.enableHeadlessClient) {
        const planned = launch(uuid, kind, 0);
        result.snapshots.push({ serverUuid: uuid, kind, args: planned.args, workingDirectory: planned.workingDirectory });
      }
    }
  }
  return structuredClone(result);
}
function add(uuid: string, running = false, hc = false) {
  const serverDir = path.join(dir, uuid); fs.mkdirSync(serverDir, { recursive: true });
  const config = { formatVersion: 2 as const, server: { serverDir }, startup: { autoInit: true, port: 2302 }, basic: { persistent: true, password: "do-not-persist-password" },
    health: { enabled: true }, tasks: { missions: [{ template: "unit.Altis" }], enableHeadlessClient: hc },
    mods: { enabledIds: [123], clientModIds: [123], hcModIds: hc ? [123] : [] },
    maintenance: { ...defaultMaintenancePolicy(), enabled: true, template: "maintenance_window" as const, timeZone: "UTC", windowConfirmed: true } };
  app.configStore.save(uuid, config);
  fs.writeFileSync(getServerExecutablePath(config), "test executable, never launched");
  expect(writeAll(uuid, config).success).toBe(true);
  fs.mkdirSync(path.dirname(key(uuid)), { recursive: true }); fs.writeFileSync(key(uuid), "old-key");
  if (running) live.set(`${uuid}:server`, launch(uuid, "server", ++pid));
  if (hc) live.set(`${uuid}:headless`, launch(uuid, "headless", ++pid));
}
async function plan(): Promise<MaintenanceExecutionPlan> {
  const items = await planner.checkUpdates("s1");
  await planner.sample();
  for (let i = 0; i < 60; i++) { now += 10000; await planner.sample(); }
  const result = await adapter.plan("s1", items.map((item) => item.key));
  expect(result.allowed).toBe(true);
  return result;
}
function update() {
  fs.writeFileSync(path.join(mod, "addons", "a.pbo"), "new-mod");
  fs.writeFileSync(path.join(mod, "keys", "a.bikey"), "new-key");
  fs.writeFileSync(path.join(mod, "keys", "b.bikey"), "brand-new-key");
  writeVersion(1700000002, "unrelated-new-version");
}
async function execute() {
  const selected = await plan();
  const executor = new MaintenanceExecutor(app.operations, adapter);
  await executor.initialize();
  try { return await executor.execute("s1", selected.mods.map((item) => item.key), "production-test-request"); }
  finally { await executor.close(); }
}
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-adapter-")); library = path.join(dir, "library");
  mod = path.join(library, "steamapps", "workshop", "content", "107410", "123"); acf = path.join(library, "steamapps", "workshop", "appworkshop_107410.acf");
  fs.mkdirSync(path.join(mod, "addons"), { recursive: true }); fs.mkdirSync(path.join(mod, "keys"));
  fs.writeFileSync(path.join(mod, "meta.cpp"), 'publishedid = 123; name = "Adapter Test";');
  fs.writeFileSync(path.join(mod, "addons", "a.pbo"), "old-mod"); fs.writeFileSync(path.join(mod, "addons", "a.pbo.unit.bisign"), "signature-file");
  fs.writeFileSync(path.join(mod, "keys", "a.bikey"), "old-key"); writeVersion();
  now = Date.parse("2026-01-01T04:05:00Z"); pid = 100; live = new Map(); unknown = false;
  const operations = new OperationsStore(dir, () => now); await operations.waitReady();
  const settings = new SteamCmdSettingsStore(dir); settings.merge({ workshopRoot: library });
  authenticate = vi.fn(async () => {}); download = vi.fn(async () => { update(); });
  app = { dataDir: dir, configStore: new ConfigStore(dir), operations, modScanner: new ModScanner(), modScanPathStore: new ModScanPathStore(dir), steamCmdSettingsStore: settings,
    steamCmd: { workshopRoot: library, withMaintenanceSession: async <T>(fn: (session: MaintenanceSteamSession) => Promise<T>) => fn({ signal: new AbortController().signal, authenticateCached: authenticate, downloadOnce: download }) },
    processManager: { forget: vi.fn() }, serverHealth: { forget: vi.fn(), setMaintenance: vi.fn() }, log: { error: vi.fn() } } as unknown as FastifyInstance;
  planner = new MaintenancePlanner(app, { runtime, now: () => now, online: async () => 0,
    remote: async (ids) => ids.map((modId) => ({ modId, title: "Adapter Test", description: "", fileSizeMb: "", fileSizeBytes: 1000, timeUpdated: 1700000002, selected: true, source: "api" })) });
  app.maintenancePlanner = planner;
  stop = vi.fn(async (value: MaintenanceProcessReceipt) => { live.delete(`${value.serverUuid}:${value.kind}`); });
  start = vi.fn(async (uuid: string, kind: "server" | "headless") => { live.set(`${uuid}:${kind}`, launch(uuid, kind, ++pid)); return pid; });
  health = vi.fn(async (uuid: string) => ({ state: "healthy", pid: live.get(`${uuid}:server`)?.pid, processAlive: true, rconResponsive: true, consecutiveHeartbeats: 2, heartbeat: { sequence: 2 } } as ServerHealthData));
  adapter = new ServiceMaintenanceAdapter(app, { runtime, stop, start, health: async (uuid) => await health(uuid) as ServerHealthData, identity: async (id) => `birth-${id}`, now: () => now, sleep: async (ms) => { now += ms; } });
});
afterEach(async () => { await planner.close(); app.operations.close(); vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

describe("生产维护适配器（真实配置、扫描、文件和检查点；进程/RCon/Steam 替身）", () => {
  it("共享目录只下载一次，恢复原服务器和 HC，不启动原停止实例；不泄露 argv/密码", async () => {
    add("s1", true, true); add("s2");
    const result = await execute();
    expect(result.state).toBe("succeeded"); expect(download).toHaveBeenCalledTimes(1); expect(download).toHaveBeenCalledWith([123]);
    expect(stop.mock.calls.map(([p]) => p.kind)).toEqual(["headless", "server"]);
    expect(start.mock.calls.map(([uuid, kind]) => `${uuid}:${kind}`)).toEqual(["s1:server", "s1:headless"]);
    expect(result.recovery.started).toHaveLength(2); expect(result.recovery.backups).toHaveLength(2);
    expect(fs.readFileSync(key("s1"), "utf8")).toBe("new-key"); expect(fs.readFileSync(key("s2", "b"), "utf8")).toBe("brand-new-key");
    expect(JSON.stringify(result)).not.toContain("do-not-persist-password"); expect(JSON.stringify(result)).not.toContain('"args"');
    // batchId 是随机 UUID，搜索整个 JSON 字符串会偶发命中无关子串（如 "456"），因此只检查 workshop 记录的 modId。
    expect(result.recovery.backups.flatMap((ref) => (ref.workshopRecords ?? []).flatMap((record) => record.items.map((item) => item.modId)))).not.toContain(456);
  });
  it("更新健康失败恢复旧模组、公钥和目标 ACF；保留其他 ID 新记录及玩家存档", async () => {
    add("s1", true); fs.writeFileSync(path.join(dir, "s1", "player-save.bin"), "original-save");
    health.mockImplementation(async (uuid: string) => ({ state: fs.readFileSync(path.join(mod, "addons", "a.pbo"), "utf8") === "new-mod" ? "unhealthy" : "healthy", pid: live.get(`${uuid}:server`)?.pid, processAlive: true, rconResponsive: true, consecutiveHeartbeats: 2, heartbeat: { sequence: 2 } }));
    const result = await execute();
    expect(result.state).toBe("rolled_back"); expect(start).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(path.join(mod, "addons", "a.pbo"), "utf8")).toBe("old-mod");
    expect(fs.readFileSync(key("s1"), "utf8")).toBe("old-key"); expect(fs.existsSync(key("s1", "b"))).toBe(false);
    const installed = workshopSection(workshopSection(parseWorkshopKeyValues(fs.readFileSync(acf, "utf8")).AppWorkshop)!.WorkshopItemsInstalled)!;
    expect(workshopSection(installed["123"])!.manifest).toBe("1700000000"); expect(workshopSection(installed["456"])!.manifest).toBe("unrelated-new-version");
    expect(fs.readFileSync(path.join(dir, "s1", "player-save.bin"), "utf8")).toBe("original-save");
  });
  it("新公钥必须先登记备份；登记失败不覆盖任何公钥", async () => {
    add("s1"); const p = await plan(); await adapter.prepareBackup("batch", p, new AbortController().signal);
    update();
    await expect(adapter.verifyUpdated(p, () => { throw new Error("checkpoint failed"); })).rejects.toThrow("checkpoint failed");
    expect(fs.readFileSync(key("s1"), "utf8")).toBe("old-key"); expect(fs.existsSync(key("s1", "b"))).toBe(false);
  });
  it("停服前识别配置、游戏 cfg、同 PID 新会话和远程目标改变", async () => {
    add("s1", true); const p = await plan();
    expect((await adapter.revalidate(p)).allowed).toBe(true);
    live.get("s1:server")!.session = "reused-pid";
    await expect(adapter.revalidate(p)).rejects.toThrow("SCOPE_CHANGED");
    live.get("s1:server")!.session = p.instances[0].server!.session;
    const cfg = path.join(getConfigRoot(path.join(dir, "s1"), "s1"), "server.cfg"); fs.appendFileSync(cfg, "\nchanged=1;");
    await expect(adapter.revalidate(p)).rejects.toThrow("SCOPE_CHANGED"); expect(stop).not.toHaveBeenCalled();
  });
  it("原 argv 与下一次启动参数不一致时不能偷偷应用新配置", async () => {
    add("s1", true); live.get("s1:server")!.args.push("-old-unapplied-argument");
    await expect(plan()).rejects.toThrow("SCOPE_CHANGED"); expect(start).not.toHaveBeenCalled();
  });
  it("停服对全部身份先校验；PID 复用、OS 未知、未知新进程均不能部分强停", async () => {
    add("s1", true, true); const p = await plan(); live.get("s1:server")!.session = "new-session";
    await expect(adapter.stop(p, [])).rejects.toThrow("STOP_FAILED"); expect(stop).not.toHaveBeenCalled();
    live.get("s1:server")!.session = p.instances[0].server!.session; unknown = true;
    await expect(adapter.stop(p, [])).rejects.toThrow("STOP_FAILED"); expect(stop).not.toHaveBeenCalled();
  });
  it("发停止信号不等于退出，未退出禁止备份恢复和启动", async () => {
    add("s1", true); const p = await plan(); stop.mockResolvedValue(undefined);
    await expect(adapter.stop(p, [])).rejects.toThrow("STOP_FAILED");
    await expect(adapter.startOriginal(p, () => {})).rejects.toThrow("STOP_FAILED"); expect(start).not.toHaveBeenCalled();
  });
  it("新启动每个 PID 登记失败后不继续启动 HC，也不静默认领未知进程", async () => {
    add("s1", true, true); const p = await plan(); await adapter.stop(p, []);
    await expect(adapter.startOriginal(p, () => { throw new Error("journal unavailable"); })).rejects.toThrow("journal unavailable");
    expect(start).toHaveBeenCalledTimes(1);
    await expect(adapter.stop(p, [])).rejects.toThrow("STOP_FAILED");
  });
  it("版本仍旧或未知时不部署公钥；客户模组签名退化触发回滚", async () => {
    add("s1"); const p = await plan();
    await expect(adapter.verifyUpdated(p, () => {})).rejects.toThrow("VERSION_MISMATCH");
    download.mockImplementation(async () => { update(); fs.unlinkSync(path.join(mod, "addons", "a.pbo.unit.bisign")); });
    const result = await execute(); expect(result.state).toBe("rolled_back"); expect(result.result).toBe("SIGNATURE_DEGRADED");
    expect(fs.existsSync(path.join(mod, "addons", "a.pbo.unit.bisign"))).toBe(true);
  });
  it("服务端专用模组缺签名发风险事件，不冒充客户端入服阻断", async () => {
    add("s1"); app.configStore.patchSection("s1", "mods", { clientModIds: [], serverModIds: [123] });
    download.mockImplementation(async () => { update(); fs.unlinkSync(path.join(mod, "addons", "a.pbo.unit.bisign")); });
    const result = await execute(); expect(result.state).toBe("succeeded");
    const event = app.operations.events(0, 100).items.find((item) => item.reasonCode === "SERVER_ONLY_SIGNATURE_DEGRADED");
    expect(event?.message).toContain("不等同于客户端入服阻断");
    expect(app.operations.activeEvents().some((item) => item.eventId === event?.eventId)).toBe(true);
  });
  it("备份后的源文件变化阻止停服；只备份目标模组而不复制全部库", async () => {
    add("s1"); const p = await plan(), backups = [await adapter.prepareBackup("batch", p, new AbortController().signal)];
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "maintenance-backups", "batch", "manifest.json"), "utf8"));
    expect(manifest.targets.filter((item: { role: string }) => item.role === "mod")).toHaveLength(1);
    expect(manifest.targets.map((item: { path: string }) => item.path)).not.toContain(acf);
    fs.writeFileSync(path.join(mod, "addons", "a.pbo"), "external-change");
    await expect(adapter.verifyBackup(p, backups)).rejects.toThrow("源文件发生变化");
  });
  it("健康不能使用维护显示状态、旧 PID 或未登记 HC，等待有上限", async () => {
    add("s1", true); const p = await plan(); await adapter.stop(p, []);
    const started: MaintenanceProcessReceipt[] = []; await adapter.startOriginal(p, (value) => started.push(value));
    health.mockResolvedValue({ state: "maintenance", pid: started[0].pid, processAlive: true, rconResponsive: true, consecutiveHeartbeats: 2, heartbeat: {} });
    await expect(adapter.waitHealthy(p, started, new AbortController().signal)).rejects.toThrow("HEALTH_FAILED");
    health.mockResolvedValue({ state: "healthy", pid: 99999, processAlive: true, rconResponsive: true, consecutiveHeartbeats: 2, heartbeat: {} });
    await expect(adapter.waitHealthy(p, started, new AbortController().signal)).rejects.toThrow("HEALTH_FAILED");
  });
  it("公钥叶子的真实符号链接不能在 realpath 后丢失证据（需 OS 创建权限）", async ({ skip }) => {
    add("s1"); const outside = path.join(dir, "outside.bikey"); fs.writeFileSync(outside, "outside-evidence");
    fs.unlinkSync(key("s1"));
    try { fs.symlinkSync(outside, key("s1"), "file"); }
    catch (error) { if (process.platform === "win32" && (error as NodeJS.ErrnoException).code === "EPERM") { skip(); return; } throw error; }
    await expect(plan()).rejects.toThrow("SIGNATURE_DEGRADED");
    expect(fs.existsSync(path.join(dir, "maintenance-backups"))).toBe(false);
    expect(fs.readFileSync(outside, "utf8")).toBe("outside-evidence");
  });
  it("公钥叶子先 lstat 拒绝链接，再解析路径（链接元数据故障注入）", async () => {
    add("s1"); const original = asyncFs.lstat;
    vi.spyOn(asyncFs, "lstat").mockImplementation((async (file: fs.PathLike, options?: unknown) => {
      const value = await original(file, options as undefined);
      if (String(file).toLowerCase() === key("s1").toLowerCase()) value.isSymbolicLink = () => true;
      return value;
    }) as typeof asyncFs.lstat);
    await expect(plan()).rejects.toThrow("SIGNATURE_DEGRADED");
    expect(fs.existsSync(path.join(dir, "maintenance-backups"))).toBe(false);
    expect(fs.readFileSync(key("s1"), "utf8")).toBe("old-key");
  });
  it("公钥叶子的真实硬链接不能将外部文件纳入备份或覆盖", async () => {
    add("s1"); const outside = path.join(dir, "outside.bikey"); fs.writeFileSync(outside, "outside-evidence");
    fs.unlinkSync(key("s1")); fs.linkSync(outside, key("s1"));
    await expect(plan()).rejects.toThrow("SIGNATURE_DEGRADED");
    expect(fs.existsSync(path.join(dir, "maintenance-backups"))).toBe(false);
    expect(fs.readFileSync(outside, "utf8")).toBe("outside-evidence"); expect(stop).not.toHaveBeenCalled();
  });
  it("计划后替换旧公钥为链接不能进入备份，新公钥链接不能进入新增备份", async () => {
    add("s1"); const p = await plan(); const outside = path.join(dir, "outside.bikey"); fs.writeFileSync(outside, "outside-evidence");
    fs.unlinkSync(key("s1")); fs.linkSync(outside, key("s1"));
    await expect(adapter.prepareBackup("blocked", p, new AbortController().signal)).rejects.toThrow("SIGNATURE_DEGRADED");
    expect(fs.existsSync(path.join(dir, "maintenance-backups", "blocked"))).toBe(false);
    fs.unlinkSync(key("s1")); fs.writeFileSync(key("s1"), "old-key");
    await adapter.prepareBackup("batch", p, new AbortController().signal); update();
    fs.linkSync(outside, key("s1", "b")); const register = vi.fn();
    await expect(adapter.verifyUpdated(p, register)).rejects.toThrow("SIGNATURE_DEGRADED");
    expect(register).not.toHaveBeenCalled(); expect(fs.readFileSync(outside, "utf8")).toBe("outside-evidence");
    expect(fs.readFileSync(key("s1"), "utf8")).toBe("old-key");
  });
  it("计划后 Keys 根目录改指向时拒绝公钥备份，不影响目录外文件", async () => {
    add("s1"); const p = await plan();
    const keys = path.dirname(key("s1")), moved = path.join(dir, "moved-keys"); fs.renameSync(keys, moved);
    fs.symlinkSync(moved, keys, process.platform === "win32" ? "junction" : "dir");
    await expect(adapter.prepareBackup("blocked", p, new AbortController().signal)).rejects.toThrow("SCOPE_CHANGED");
    expect(fs.readFileSync(path.join(moved, "123-a.bikey"), "utf8")).toBe("old-key");
  });
  it("下载后链接不能引导公钥扫描越出受管目录", async () => {
    add("s1"); const p = await plan(); update();
    const outside = path.join(dir, "outside"); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, "outside.bikey"), "private-key-data");
    fs.symlinkSync(outside, path.join(mod, "unexpected-link"), process.platform === "win32" ? "junction" : "dir");
    const references: BackupReference[] = [];
    await expect(adapter.verifyUpdated(p, (value) => references.push(value))).rejects.toThrow("链接");
    expect(references).toHaveLength(0); expect(fs.readFileSync(key("s1"), "utf8")).toBe("old-key");
    expect(p.scope.paths?.find((item) => item.mode === "write" && item.path === physicalLockPath(mod))).toBeDefined();
  });
});
