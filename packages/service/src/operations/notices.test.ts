import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { OperationsStore } from "./store.js";

let dir: string, store: OperationsStore, now: number;
const input = (batchId: string, reasonCode: string, type: "download_failed" | "signature_degraded" = "download_failed") =>
  ({ type, reasonCode, severity: "warning" as const, serverUuids: ["one"], modIds: [123], batchId,
    message: `批次 ${batchId} 原因 ${reasonCode}`, suggestedAction: "核对检查点", requiresAttention: true });

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-notices-")); now = Date.UTC(2026, 2, 1);
  store = new OperationsStore(dir, () => now);
  await store.waitReady();
});
afterEach(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe("维护通知意图的持久补发", () => {
  it("意图先独立落盘，Service 重启后补发一次且不重复", async () => {
    store.enqueueNotice({ id: "notice-1", kind: "record", input: input("b1", "DOWNLOAD_FAILED") });
    expect(store.events().items).toHaveLength(0);
    expect(store.pendingNotices()).toBe(1);
    store.close();
    store = new OperationsStore(dir, () => now);
    await store.waitReady();
    store.flushNotices();
    expect(store.events().items).toHaveLength(1);
    expect(store.pendingNotices()).toBe(0);
    store.flushNotices();
    expect(store.events().items).toHaveLength(1);
  });
  it("同原因同批次补齐时只保留一个未恢复事件", () => {
    store.enqueueNotice({ id: "a", kind: "record", input: input("b1", "DOWNLOAD_FAILED") });
    store.flushNotices();
    store.enqueueNotice({ id: "b", kind: "record", input: input("b1", "DOWNLOAD_FAILED") });
    store.flushNotices();
    expect(store.activeEvents()).toHaveLength(1);
    expect(store.pendingNotices()).toBe(0);
  });
  it("恢复意图只解除本批次匹配原因，保留仍存在的签名风险", () => {
    store.record(input("b1", "HEALTH_FAILED", "download_failed"));
    store.record(input("b1", "SERVER_ONLY_SIGNATURE_DEGRADED", "signature_degraded"));
    store.record(input("b2", "HEALTH_FAILED", "download_failed"));
    store.enqueueNotice({ id: "resolve", kind: "resolve", batchIds: ["b1"], exceptReasons: ["SERVER_ONLY_SIGNATURE_DEGRADED"] });
    store.flushNotices();
    const active = store.activeEvents().map((event) => `${event.batchId}:${event.reasonCode}`).sort();
    expect(active).toEqual(["b1:SERVER_ONLY_SIGNATURE_DEGRADED", "b2:HEALTH_FAILED"]);
    expect(store.events().items.filter((event) => event.change === "recovered")).toHaveLength(1);
  });
  it("通知意图被记录在检查点事务中，损坏的检查点不会留下孤立通知", () => {
    store.checkpoint({ id: "batch-1", state: "failed", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), serverUuids: ["one"], modIds: [123],
      requiresAttention: true, result: "HEALTH_FAILED", recovery: { version: 1 } }, [{ id: "notice-x", kind: "record", input: input("batch-1", "HEALTH_FAILED") }]);
    expect(store.pendingNotices()).toBe(1);
    expect(store.maintenance("batch-1")).not.toBeNull();
    store.flushNotices();
    expect(store.pendingNotices()).toBe(0);
  });
});
