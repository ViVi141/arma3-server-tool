import { describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { MaintenanceDiscovery } from "../types/maintenance.js";
import type { MaintenanceExecutor } from "./executor.js";
import { MaintenanceAutoScheduler } from "./auto-scheduler.js";
import type { MaintenancePlanner } from "./planner.js";

const key = (n: number) => String(n).repeat(64).slice(0, 64);
function discovery(id: number, uuid: string, overrides: Partial<MaintenanceDiscovery> = {}): MaintenanceDiscovery {
  return { key: key(id), modId: 100 + id, physicalPath: `/mods/${id}`, title: `模组 ${id}`, configuredUuids: [uuid],
    localVersion: { timeUpdated: 1, sizeBytes: 10, manifest: "1", acfPath: "/acf" }, remoteVersion: { timeUpdated: 2, sizeBytes: 10 },
    status: "outdated", checkedAt: new Date().toISOString(), pendingSince: new Date(Date.now() - 86400000).toISOString(), ...overrides };
}
function harness(configs: Record<string, unknown>, discoveries: MaintenanceDiscovery[], checkpoints: unknown[] = []) {
  const app = { configStore: { listServers: () => Object.keys(configs).map((uuid) => ({ uuid, name: uuid })), load: (uuid: string) => configs[uuid] },
    operations: { checkpoints: () => checkpoints }, log: { error: vi.fn() } } as unknown as FastifyInstance;
  const planner = { checkUpdates: vi.fn(async () => discoveries) } as unknown as MaintenancePlanner;
  const executor = { automaticBlocked: vi.fn(() => false), submit: vi.fn(() => ({ batch: { id: "new" }, work: Promise.resolve({}) })) } as unknown as MaintenanceExecutor;
  return { app, planner, executor, scheduler: new MaintenanceAutoScheduler(app, planner, executor) };
}
const policy = (overrides: Record<string, unknown> = {}) => ({ enabled: true, template: "maintenance_window", windowConfirmed: true, expectedDurationMinutes: 60, ...overrides });

describe("自动维护调度", () => {
  it("仅检查、未确认窗口或未启用策略都不自动停服", async () => {
    const discoveries = [discovery(1, "a"), discovery(2, "b")];
    const { scheduler, executor } = harness({ a: { maintenance: policy({ template: "check_only" }) }, b: { maintenance: policy({ windowConfirmed: false }) }, c: {} }, discoveries);
    await scheduler.runOnce();
    expect(executor.submit).not.toHaveBeenCalled();
  });
  it("只提交已确认更新的目标，已阻断或不相关实例不进批次", async () => {
    const discoveries = [discovery(1, "a"), discovery(2, "a", { status: "unknown" }), discovery(3, "b")];
    const { scheduler, executor } = harness({ a: { maintenance: policy() }, b: { maintenance: policy() } }, discoveries);
    vi.mocked(executor.automaticBlocked).mockImplementation((keys: string[]) => keys.includes(key(1)));
    await scheduler.runOnce();
    expect(executor.submit).toHaveBeenCalledTimes(1);
    expect(executor.submit).toHaveBeenCalledWith("b", [key(3)], expect.stringMatching(/^auto-[a-f0-9]{40}$/));
  });
  it("相同物理资源已有未结束批次时不重复开新批次", async () => {
    const discoveries = [discovery(1, "a")];
    const active = { state: "downloading", recovery: { version: 1, request: { serverUuid: "a", keys: [key(1)], retryOf: null } } };
    const { scheduler, executor } = harness({ a: { maintenance: policy() } }, discoveries, [active]);
    await scheduler.runOnce();
    expect(executor.submit).not.toHaveBeenCalled();
  });
  it("远程版本查询失败不提交任何批次，保留旧版本与原运行状态", async () => {
    const { app, planner, executor, scheduler } = harness({ a: { maintenance: policy() } }, []);
    vi.mocked(planner.checkUpdates).mockRejectedValue(new Error("workshop offline"));
    await scheduler.runOnce();
    expect(executor.submit).not.toHaveBeenCalled();
    expect(app.log.error).toHaveBeenCalled();
  });
  it("提交被拒绝时记录日志，不影响后续实例", async () => {
    const discoveries = [discovery(1, "a"), discovery(2, "b")];
    const { app, executor, scheduler } = harness({ a: { maintenance: policy() }, b: { maintenance: policy() } }, discoveries);
    vi.mocked(executor.submit).mockImplementationOnce(() => { throw new Error("维护执行器尚未就绪或已关闭"); });
    await scheduler.runOnce();
    expect(executor.submit).toHaveBeenCalledTimes(2);
    expect(app.log.error).toHaveBeenCalledTimes(1);
  });
});
