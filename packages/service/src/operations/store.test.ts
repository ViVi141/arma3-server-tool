import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { OperationsStore, ExpiredOperationsCursor } from "./store.js";
import type { OperationEventInput } from "../types/operations.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

let dir: string;
let store: OperationsStore;
let now: number;
const input: OperationEventInput = { type: "health_unhealthy", severity: "critical", serverUuids: ["srv-1"], modIds: [], batchId: null,
  reasonCode: "HEARTBEAT_STALE", message: "90 秒没有心跳", suggestedAction: "检查 RPT", requiresAttention: true };
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-ops-"));
  now = Date.UTC(2026, 0, 1);
  store = new OperationsStore(dir, () => now, () => ["unit-secret"]);
  await store.waitReady();
});
afterEach(() => { vi.restoreAllMocks(); store.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe("持久运维事件", () => {
  it("同一故障去重，确认已读不恢复，状态改变和恢复可从游标补拉", () => {
    const notify = vi.fn(); store.on("event", notify);
    const first = store.record(input);
    expect(store.record({ ...input })).toEqual(first);
    expect(notify).toHaveBeenCalledTimes(1);
    const ack = store.acknowledge(first.eventId)!;
    expect(ack.recoveredAt).toBeNull();
    expect(ack.acknowledgedAt).not.toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);
    now += 1000;
    const changed = store.record({ ...input, message: "RCon 也无响应" });
    expect(changed.eventId).toBe(first.eventId);
    expect(changed.sequence).toBeGreaterThan(ack.sequence);
    const recovered = store.resolve(first.eventId)!;
    expect(recovered.recoveredAt).not.toBeNull();
    expect(notify).toHaveBeenCalledTimes(3);
    const page = store.events(first.sequence, 2);
    expect(page.items.map((e) => e.change)).toEqual(["acknowledged", "changed"]);
    expect(page.hasMore).toBe(true);
    expect(store.events(page.nextCursor).items).toEqual([recovered]);
    expect(store.activeEvents()).toEqual([]);
    expect(store.record(input).eventId).not.toBe(first.eventId);
  });
  it("重启后保留序号、去重状态与维护检查点，不把读取当恢复", async () => {
    const event = store.record(input);
    store.checkpoint({ id: "batch-1", state: "downloading", createdAt: "now", updatedAt: "now", serverUuids: ["srv-1"], modIds: [1], requiresAttention: false, result: null, recovery: { backupPath: "/test/backup", wasRunning: true } });
    store.close();
    store = new OperationsStore(dir, () => now);
    await store.waitReady();
    expect(store.events().items).toEqual([event]);
    expect(store.events().items).toEqual([event]);
    expect(store.record(input)).toEqual(event);
    expect(store.maintenance("batch-1")).toMatchObject({ state: "downloading", recovery: { wasRunning: true } });
    expect(store.checkpoints()).toHaveLength(1);
    expect(store.record({ ...input, reasonCode: "OTHER" }).sequence).toBeGreaterThan(event.sequence);
  });
  it("解决事件保留 30 天，未解决的旧故障保留，过期游标明确报错并能重新同步", async () => {
    const unresolved = store.record(input);
    const resolved = store.record({ ...input, reasonCode: "TEMPORARY" });
    store.resolve(resolved.eventId);
    now += 31 * 86400000;
    store.prune();
    expect(store.getEvent(resolved.eventId)).toBeNull();
    expect(store.getEvent(unresolved.eventId)?.recoveredAt).toBeNull();
    expect(() => store.events(0)).toThrow(ExpiredOperationsCursor);
    const page = store.events();
    expect(page.earliestCursor).toBeGreaterThan(0);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ eventId: unresolved.eventId, change: "snapshot" });
    expect(page.items[0].sequence).toBeGreaterThan(page.earliestCursor);
    store.close(); store = new OperationsStore(dir, () => now); await store.waitReady();
    expect(store.events().earliestCursor).toBe(page.earliestCursor);
    expect(() => store.events(0)).toThrow(ExpiredOperationsCursor);
  });
  it("磁盘替换失败不提交内存状态、不发通知，原磁盘数据可重开", async () => {
    const first = store.record(input);
    const notify = vi.fn(); store.on("event", notify);
    vi.mocked(fs.renameSync).mockImplementationOnce(() => { throw new Error("injected disk failure"); });
    expect(() => store.resolve(first.eventId)).toThrow("disk failure");
    expect(store.getEvent(first.eventId)?.recoveredAt).toBeNull();
    expect(store.events().items).toEqual([first]);
    expect(notify).not.toHaveBeenCalled();
    store.close(); store = new OperationsStore(dir); await store.waitReady();
    expect(store.getEvent(first.eventId)?.recoveredAt).toBeNull();
  });
  it("维护幂等请求和首检查点原子落盘，磁盘失败不消耗请求 ID", async () => {
    const batch = { id: "batch-idempotent", state: "queued", createdAt: "now", updatedAt: "now", serverUuids: [], modIds: [], requiresAttention: false, result: null, recovery: {} };
    vi.mocked(fs.renameSync).mockImplementationOnce(() => { throw new Error("injected disk failure"); });
    expect(() => store.claimMaintenanceRequest("request-0001", "a".repeat(64), batch)).toThrow("disk failure");
    expect(store.maintenance(batch.id)).toBeNull();
    expect(store.claimMaintenanceRequest("request-0001", "a".repeat(64), batch).created).toBe(true);
    store.close(); store = new OperationsStore(dir); await store.waitReady();
    expect(store.claimMaintenanceRequest("request-0001", "a".repeat(64), { ...batch, id: "ignored" })).toEqual({ created: false, checkpoint: batch });
    expect(() => store.claimMaintenanceRequest("request-0001", "b".repeat(64), batch)).toThrow("不同参数");
    expect(store.checkpoints()).toEqual([batch]);
  });

  it("损坏数据库显式失败，不创建空库覆盖证据", async () => {
    store.close();
    const original = Buffer.from("corrupt operations evidence");
    fs.writeFileSync(path.join(dir, "a3st_operations.db"), original);
    store = new OperationsStore(dir);
    await expect(store.waitReady()).rejects.toThrow();
    expect(fs.readFileSync(store.filePath).equals(original)).toBe(true);
  });
  it("事件和游标历史脱敏，普通完成按批次幂等记录", () => {
    const event = store.record({ ...input, message: "unit-secret password=123 Bearer abc token=def" });
    const data = store.events().items.map((item) => item.message).join("\n");
    for (const secret of ["unit-secret", "123", "abc", "def"]) expect(data).not.toContain(secret);
    expect(event.message).toContain("[REDACTED]");
    const completed = { ...input, type: "update_completed" as const, severity: "info" as const, batchId: "batch-1", requiresAttention: false };
    const result = store.record(completed, true);
    expect(result.recoveredAt).not.toBeNull();
    expect(store.record(completed, true)).toEqual(result);
    expect(fs.existsSync(path.join(dir, "a3st_statistics.db"))).toBe(false);
  });
});
