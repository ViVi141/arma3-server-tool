import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { OperationsStore } from "../operations/store.js";
import { operationSignal } from "../util/operation-context.js";
import { MaintenanceSteamError, type MaintenanceSteamSession } from "../steamcmd/manager.js";
import { MaintenanceBackups } from "./backup.js";
import { MaintenanceLocks } from "./locks.js";
import { MaintenanceExecutor, MaintenanceFailure, type MaintenanceBatch, type MaintenanceExecutionPlan, type MaintenanceExecutorAdapter } from "./executor.js";

let dir: string, mod: string, key: string, now: number;
let store: OperationsStore, backups: MaintenanceBackups, locks: MaintenanceLocks, executor: MaintenanceExecutor;
let plan: MaintenanceExecutionPlan;
let adapter: MaintenanceExecutorAdapter;
let steam: MaintenanceSteamSession;
let calls: string[];
const selected = ["a".repeat(64)];
const requestId = "request-0001";

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-executor-")); mod = path.join(dir, "mod"); key = path.join(dir, "Keys", "mod.bikey");
  fs.mkdirSync(mod); fs.mkdirSync(path.dirname(key)); fs.writeFileSync(path.join(mod, "a.pbo"), "old-mod"); fs.writeFileSync(key, "old-key");
  now = Date.UTC(2026, 1, 1); calls = [];
  store = new OperationsStore(dir, () => now); await store.waitReady(); backups = new MaintenanceBackups(dir); locks = new MaintenanceLocks();
  plan = { mods: [{ key: selected[0], modId: 1, title: "目标", physicalPath: mod, configuredUuids: ["one", "off"], status: "outdated", checkedAt: new Date(now).toISOString(), pendingSince: new Date(now - 86400000).toISOString(), localVersion: { timeUpdated: 1, sizeBytes: 7, manifest: "1", acfPath: path.join(dir, "appworkshop.acf") }, remoteVersion: { timeUpdated: 2, sizeBytes: 7 } }],
    instances: [{ serverUuid: "one", server: { serverUuid: "one", kind: "server", pid: 10, session: "old-10", executable: path.join(dir, "arma3server.exe") }, headless: { serverUuid: "one", kind: "headless", pid: 11, session: "old-11", executable: path.join(dir, "arma3server.exe") } }, { serverUuid: "off", server: null, headless: null }],
    scope: { instances: ["one", "off"], paths: [{ path: mod, mode: "write" }, { path: key, mode: "write" }] }, fingerprint: "f".repeat(64), allowed: true, requiresCountdown: false, expectedDurationMinutes: 1 };
  steam = { signal: new AbortController().signal,
    authenticateCached: vi.fn(async () => { calls.push("auth"); }),
    downloadOnce: vi.fn(async () => { calls.push("download"); fs.writeFileSync(path.join(mod, "a.pbo"), "new-mod"); }) };
  adapter = {
    plan: vi.fn(async () => structuredClone(plan)),
    withSteamSession: async (fn) => { calls.push("queue-enter"); try { return await fn(steam); } finally { calls.push("queue-leave"); } },
    revalidate: vi.fn(async () => ({ allowed: plan.allowed, requiresCountdown: plan.requiresCountdown })),
    prepareBackup: vi.fn(async (id, _plan, signal) => { calls.push("backup"); return backups.prepare(id, [{ path: mod, role: "mod", kind: "directory" }, { path: key, role: "key", kind: "file" }], { signal }); }),
    verifyBackup: vi.fn(async (_plan, refs) => { for (const ref of refs) await backups.verifySourcesUnchanged(ref); }),
    broadcast: vi.fn(async (_plan, remaining) => { calls.push(`broadcast-${remaining}`); }),
    stop: vi.fn(async () => { calls.push("stop"); }),
    verifyUpdated: vi.fn(async () => { calls.push("verify"); fs.writeFileSync(key, "new-key"); }),
    startOriginal: vi.fn(async (value, register) => { calls.push("start"); for (const instance of value.instances) for (const receipt of [instance.server, instance.headless]) if (receipt) register({ ...receipt, pid: receipt.pid + 100, session: `new-${receipt.pid}` }); }),
    waitHealthy: vi.fn(async () => { calls.push("health"); }),
    restoreFiles: vi.fn(async (_plan, refs) => { calls.push("restore"); for (const ref of [...refs].reverse()) await backups.restore(ref); }),
    pruneBackups: vi.fn(async (keep: string[]) => backups.prune(keep)),
    setMaintenance: vi.fn(),
  };
  executor = new MaintenanceExecutor(store, adapter, locks, () => now, async (ms, signal) => { signal.throwIfAborted(); now += ms; });
  await executor.initialize();
});
afterEach(async () => { await executor.close(); store.close(); vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

function run() { return executor.execute("one", selected, requestId); }
function contents() { return [fs.readFileSync(path.join(mod, "a.pbo"), "utf8"), fs.readFileSync(key, "utf8")]; }

describe("持久维护批次执行器", () => {
  it("预检/备份/停服/下载/验证/原运行成员恢复/健康严格有序，并发请求幂等", async () => {
    const first = run(), second = run();
    expect(first).toBe(second);
    const batch = await first;
    expect(batch.state).toBe("succeeded");
    expect(calls).toEqual(["queue-enter", "auth", "backup", "stop", "download", "verify", "start", "health", "queue-leave"]);
    expect(batch.recovery.started.map((item) => [item.serverUuid, item.kind])).toEqual([["one", "server"], ["one", "headless"]]);
    expect(contents()).toEqual(["new-mod", "new-key"]);
    expect(store.events().items.some((item) => item.type === "update_completed")).toBe(true);
    expect(() => locks.assertAvailable(plan.scope)).not.toThrow();
    store.close(); store = new OperationsStore(dir); await store.waitReady();
    const restarted = new MaintenanceExecutor(store, adapter, locks); await restarted.initialize();
    expect((await restarted.execute("one", selected, requestId)).id).toBe(batch.id);
    expect(steam.downloadOnce).toHaveBeenCalledTimes(1);
    expect(() => restarted.execute("one", ["b".repeat(64)], requestId)).toThrow("不同参数");
    await restarted.close();
  });
  it("未取得租约的并发批次不能清除另一批次的维护显示或锁", async () => {
    const other = locks.acquire(plan.scope);
    try {
      expect((await run()).state).toBe("failed");
      expect(adapter.setMaintenance).not.toHaveBeenCalled();
      expect(() => locks.assertAvailable(plan.scope)).toThrow();
      expect(steam.authenticateCached).not.toHaveBeenCalled();
    } finally { other.release(); }
  });
  it("策略不允许不登录；停服前 2FA 暂停且相同请求不自动再认证", async () => {
    plan.allowed = false;
    expect((await run()).state).toBe("waiting_policy");
    expect(calls).toEqual([]);
    plan.allowed = true;
    vi.mocked(steam.authenticateCached).mockRejectedValue(new MaintenanceSteamError("AUTH_REQUIRED"));
    const paused = await executor.retry((await run()).id, "retry-0001");
    expect(paused).toMatchObject({ state: "paused_auth", requiresAttention: true, result: "AUTH_REQUIRED" });
    await executor.execute("one", selected, "retry-0001", paused.recovery.request.retryOf);
    expect(steam.authenticateCached).toHaveBeenCalledTimes(1);
    expect(adapter.stop).not.toHaveBeenCalled(); expect(adapter.prepareBackup).not.toHaveBeenCalled();
    expect(executor.automaticBlocked(selected)).toBe(true);
    expect(store.activeEvents().map((event) => event.type)).toEqual(["authentication_required"]);
  });
  it.each(["磁盘不足", "写权限不足", "备份失败"])("%s 不停服、不下载、不清空旧文件", async (message) => {
    vi.mocked(adapter.prepareBackup).mockRejectedValue(new Error(`${message} password=never-persist-this`));
    const batch = await run();
    expect(batch).toMatchObject({ state: "failed", result: "BACKUP_FAILED" });
    expect(adapter.stop).not.toHaveBeenCalled(); expect(steam.downloadOnce).not.toHaveBeenCalled();
    expect(contents()).toEqual(["old-mod", "old-key"]);
    expect(JSON.stringify(store.events())).not.toContain("never-persist-this");
  });
  it("10/5/1 广播每十秒复查，广播失败取消维护不强停", async () => {
    plan.requiresCountdown = true;
    vi.mocked(adapter.broadcast).mockImplementation(async (_plan, remaining) => { calls.push(`broadcast-${remaining}`); if (remaining === 60) throw new Error("RCon failed"); });
    const batch = await run();
    expect(batch).toMatchObject({ state: "failed", result: "BROADCAST_FAILED" });
    expect(calls.filter((item) => item.startsWith("broadcast"))).toEqual(["broadcast-600", "broadcast-300", "broadcast-60"]);
    expect(now).toBe(Date.UTC(2026, 1, 1) + 540000);
    expect(adapter.revalidate).toHaveBeenCalledTimes(60);
    expect(adapter.stop).not.toHaveBeenCalled();
  });
  it("广播延迟不压缩预告间隔，完整倒计时结束才停服", async () => {
    plan.requiresCountdown = true;
    const noticed: number[] = [];
    vi.mocked(adapter.broadcast).mockImplementation(async () => { noticed.push(now); now += 20000; });
    const startedAt = now;
    expect((await run()).state).toBe("succeeded");
    expect(noticed.map((value) => value - startedAt)).toEqual([0, 320000, 580000]);
    expect(now - startedAt).toBe(660000);
    expect(adapter.stop).toHaveBeenCalledTimes(1);
  });
  it("多次显式重试成功解除整个失败链的自动暂停；重试不能换资源", async () => {
    vi.mocked(steam.authenticateCached).mockRejectedValue(new MaintenanceSteamError("AUTH_REQUIRED"));
    const first = await run(); const second = await executor.retry(first.id, "retry-0001");
    await expect(executor.execute("one", ["b".repeat(64)], "retry-0002", second.id)).rejects.toThrow("保留原批次目标");
    vi.mocked(steam.authenticateCached).mockResolvedValue();
    const third = await executor.retry(second.id, "retry-0003");
    expect(third.state).toBe("succeeded"); expect(executor.automaticBlocked(selected)).toBe(false);
    expect(store.activeEvents()).toEqual([]);
    expect((await executor.retry(second.id, "retry-0003")).id).toBe(third.id);
    expect(steam.downloadOnce).toHaveBeenCalledTimes(1);
  });
  it("倒计时内进入保护时段/在线未知/范围变化立即退出，不沿用旧预览", async () => {
    plan.requiresCountdown = true;
    vi.mocked(adapter.revalidate).mockImplementation(async () => ({ allowed: now < Date.UTC(2026, 1, 1) + 10000, requiresCountdown: true }));
    expect((await run()).state).toBe("waiting_policy");
    expect(adapter.broadcast).toHaveBeenCalledTimes(1); expect(adapter.stop).not.toHaveBeenCalled();
  });
  it("无人预览后玩家进入需广播时不能直接停服；备份后最后复查仍有效", async () => {
    vi.mocked(adapter.verifyBackup).mockImplementation(async () => { plan.requiresCountdown = true; });
    expect((await run()).state).toBe("waiting_policy");
    expect(adapter.stop).not.toHaveBeenCalled();
  });
  it.each(["AUTH_REQUIRED", "DOWNLOAD_FAILED"])("下载阶段 %s 后一次恢复旧文件、公钥与原运行成员", async (code) => {
    vi.mocked(steam.downloadOnce).mockImplementation(async () => { calls.push("download"); fs.writeFileSync(path.join(mod, "a.pbo"), "partial"); throw new MaintenanceSteamError(code as "AUTH_REQUIRED" | "DOWNLOAD_FAILED"); });
    const batch = await run();
    expect(batch).toMatchObject({ state: "rolled_back", result: code });
    expect(contents()).toEqual(["old-mod", "old-key"]);
    expect(adapter.restoreFiles).toHaveBeenCalledTimes(1); expect(adapter.startOriginal).toHaveBeenCalledTimes(1);
    expect(steam.downloadOnce).toHaveBeenCalledTimes(1);
    expect(calls.indexOf("queue-leave")).toBeGreaterThan(calls.indexOf("restore"));
    expect(store.events().items.some((item) => item.type === "update_completed")).toBe(false);
    expect(executor.automaticBlocked(selected)).toBe(true);
  });
  it("新版本健康失败回滚后只恢复一次；第二次健康失败保留锁及备份", async () => {
    vi.mocked(adapter.waitHealthy).mockRejectedValue(new MaintenanceFailure("HEALTH_FAILED"));
    const batch = await run();
    expect(batch).toMatchObject({ state: "manual_intervention", requiresAttention: true });
    expect(adapter.startOriginal).toHaveBeenCalledTimes(2); expect(adapter.restoreFiles).toHaveBeenCalledTimes(1);
    expect(contents()).toEqual(["old-mod", "old-key"]);
    expect(() => locks.assertAvailable(plan.scope)).toThrow("维护");
    expect(fs.existsSync(path.join(backups.root, batch.id, "manifest.json"))).toBe(true);
    await expect(executor.retry(batch.id, "retry-0001")).rejects.toThrow("人工介入");
    expect(store.activeEvents().some((event) => event.type === "recovery_failed")).toBe(true);
  });
  it("进程停止失败不下载；不能确认退出时不恢复文件，也不启动重复进程", async () => {
    vi.mocked(adapter.stop).mockRejectedValue(new MaintenanceFailure("STOP_FAILED"));
    expect((await run()).state).toBe("manual_intervention");
    expect(steam.downloadOnce).not.toHaveBeenCalled(); expect(adapter.restoreFiles).not.toHaveBeenCalled(); expect(adapter.startOriginal).not.toHaveBeenCalled();
  });
  it("超出预计预算只告警一次，不为赶预算跳过下载或恢复", async () => {
    plan.expectedDurationMinutes = 1;
    vi.mocked(steam.downloadOnce).mockImplementation(async () => { calls.push("download"); now += 120000; fs.writeFileSync(path.join(mod, "a.pbo"), "new-mod"); });
    const batch = await run();
    expect(batch.state).toBe("succeeded");
    const alerts = store.events().items.filter((event) => event.type === "maintenance_over_budget" && event.change === "occurred");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].reasonCode).toBe("EXPECTED_DURATION_EXCEEDED");
    expect(new Set(store.events().items.filter((event) => event.type === "maintenance_over_budget").map((event) => event.eventId)).size).toBe(1);
    expect(adapter.stop).toHaveBeenCalledTimes(1); expect(adapter.restoreFiles).not.toHaveBeenCalled();
    expect(contents()).toEqual(["new-mod", "new-key"]);
  });
  it("成功批次只保留最近一批备份；未解决故障批次的备份不被清理", { timeout: 30_000 }, async () => {
    const first = await run();
    expect(first.state).toBe("succeeded");
    expect(fs.existsSync(path.join(backups.root, first.id, "manifest.json"))).toBe(true);
    // 模拟该批次仍需人工处理：即使之后出现新的成功批次，它的备份也必须保留。
    store.checkpoint({ ...first, state: "manual_intervention", requiresAttention: true } as MaintenanceBatch);
    const second = await executor.execute("one", selected, "request-0002");
    const third = await executor.execute("one", selected, "request-0003");
    expect([second.state, third.state]).toEqual(["succeeded", "succeeded"]);
    expect(fs.existsSync(path.join(backups.root, first.id, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(backups.root, second.id, "manifest.json"))).toBe(false);
    expect(fs.existsSync(path.join(backups.root, third.id, "manifest.json"))).toBe(true);
  });
  it("人工介入确认处理后释放锁、保留备份并允许显式重试", async () => {
    vi.mocked(adapter.waitHealthy).mockRejectedValue(new MaintenanceFailure("HEALTH_FAILED"));
    const batch = await run();
    expect(batch.state).toBe("manual_intervention");
    expect(() => locks.assertAvailable(plan.scope)).toThrow("维护");
    expect(executor.resolveManual("missing")).toBeNull();
    vi.mocked(adapter.waitHealthy).mockResolvedValue();
    const released = executor.resolveManual(batch.id)!;
    expect(released).toMatchObject({ state: "failed", result: "MANUAL_RELEASED", requiresAttention: false });
    expect(() => locks.assertAvailable(plan.scope)).not.toThrow();
    expect(adapter.setMaintenance).toHaveBeenLastCalledWith(["one", "off"], false);
    expect(fs.existsSync(path.join(backups.root, batch.id, "manifest.json"))).toBe(true);
    expect(store.activeEvents().some((event) => event.type === "recovery_failed")).toBe(false);
    expect((await executor.retry(batch.id, "retry-0001")).state).toBe("succeeded");
  });
  it("下载取消后屏蔽取消完成恢复，close 等待整个恢复而非只等 SteamCMD", async () => {
    let entered!: () => void, release!: () => void;
    const downloading = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(steam.downloadOnce).mockImplementation(async () => { entered(); await gate; operationSignal.getStore()?.throwIfAborted(); });
    vi.mocked(adapter.restoreFiles).mockImplementation(async (_plan, refs) => { expect(operationSignal.getStore()).toBeUndefined(); for (const ref of refs) await backups.restore(ref); });
    const pending = run(); await downloading;
    let closed = false; const closing = executor.close().then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false);
    release();
    expect((await pending).state).toBe("rolled_back"); await closing;
    expect(adapter.startOriginal).toHaveBeenCalledTimes(1); expect(contents()).toEqual(["old-mod", "old-key"]);
  });
  it("检查点写失败不执行下一项副作用；保留已持有锁等待持久恢复", async () => {
    const original = store.checkpoint.bind(store);
    vi.spyOn(store, "checkpoint").mockImplementation((value) => { if (value.state === "downloading") throw new Error("disk failure"); original(value); });
    await expect(run()).rejects.toThrow("disk failure");
    expect(steam.downloadOnce).not.toHaveBeenCalled();
    expect(store.checkpoints()[0].state).toBe("stopping");
    expect(() => locks.assertAvailable(plan.scope)).toThrow("维护");
  });
  it("Service 中断后先重建锁再恢复，没有登录和重复下载，仍不误报成功", async () => {
    const complete = await run();
    const batch: MaintenanceBatch = { ...complete, state: "downloading", result: null, recovery: { ...complete.recovery, started: [] } };
    store.checkpoint(batch); calls.length = 0;
    await executor.close(); locks = new MaintenanceLocks();
    const restore = adapter.restoreFiles;
    adapter.restoreFiles = async (value, refs) => { expect(() => locks.assertAvailable({ instances: ["one"] })).not.toThrow(); await restore(value, refs); };
    executor = new MaintenanceExecutor(store, adapter, locks, () => now);
    await executor.initialize();
    expect(store.maintenance(batch.id)?.state).toBe("rolled_back");
    expect(calls).toEqual(["queue-enter", "stop", "restore", "start", "health", "queue-leave"]);
    expect(contents()).toEqual(["old-mod", "old-key"]);
  });
  it("恢复启动阶段再次中断不再自动尝试启动，旧版备份与范围锁保留", async () => {
    const complete = await run();
    store.checkpoint({ ...complete, state: "rolling_back", recovery: { ...complete.recovery, rollbackPhase: "starting" } });
    vi.mocked(adapter.startOriginal).mockClear(); vi.mocked(adapter.stop).mockClear();
    await executor.close(); locks = new MaintenanceLocks(); executor = new MaintenanceExecutor(store, adapter, locks);
    await executor.initialize();
    expect(store.maintenance(complete.id)?.state).toBe("manual_intervention");
    expect(adapter.startOriginal).not.toHaveBeenCalled(); expect(adapter.stop).not.toHaveBeenCalled();
    expect(() => locks.assertAvailable(plan.scope)).toThrow("维护");
  });
});
