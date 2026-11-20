import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SMTPServer } from "smtp-server";
import { OperationsStore } from "./store.js";
import { EmailNotifier, sendSmtpEmail } from "./email.js";
import { DEFAULT_NOTIFICATION_SETTINGS, validateNotificationSettings } from "./notification-settings.js";
import type { NotificationSettings, OperationEventInput } from "../types/operations.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});
const settings: NotificationSettings = { enabled: true, host: "127.0.0.1", port: 2525, tls: "none", username: "", from: "ops@example.test", recipients: ["admin@example.test"] };
const event: OperationEventInput = { type: "download_failed", severity: "critical", reasonCode: "DOWNLOAD_FAILED", serverUuids: ["srv"], modIds: [123], batchId: "batch", message: "unit-secret 下载失败", suggestedAction: "查看事件", requiresAttention: true };
let store: OperationsStore;
let dir: string;
let now: number;
let worker: EmailNotifier | undefined;
let smtp: SMTPServer | undefined;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-email-"));
  now = Date.UTC(2026, 0, 1);
  store = new OperationsStore(dir, () => now, () => ["unit-secret"]);
  await store.waitReady();
});
afterEach(async () => {
  await worker?.close(); worker = undefined;
  if (smtp) { await new Promise<void>((resolve) => smtp!.close(resolve)); smtp = undefined; }
  store.close(); fs.rmSync(dir, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.restoreAllMocks();
});

describe("持久 Email 通知", () => {
  it("默认关闭；启用仅通知人工介入和恢复，重复轮询及已读不发邮件", () => {
    expect(store.notificationSettings()).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    store.record(event); expect(store.deliveries()).toEqual([]);
    store.saveNotificationSettings(settings);
    const first = store.record({ ...event, batchId: "batch-2" });
    store.record({ ...event, batchId: "batch-2" });
    store.acknowledge(first.eventId);
    store.record({ ...event, type: "update_completed", requiresAttention: false }, true);
    expect(store.deliveries()).toHaveLength(1);
    store.resolve(first.eventId);
    expect(store.deliveries().map((item) => item.kind)).toEqual(["recovery", "attention"]);
    expect(JSON.stringify(store.deliveries())).not.toContain("unit-secret");
  });
  it("事件与邮件队列原子提交；落盘失败二者都不出现，重启不丢通知", async () => {
    store.saveNotificationSettings(settings);
    vi.mocked(fs.renameSync).mockImplementationOnce(() => { throw new Error("disk failure"); });
    expect(() => store.record(event)).toThrow("disk failure");
    expect(store.events().items).toEqual([]); expect(store.deliveries()).toEqual([]);
    const saved = store.record(event);
    store.close(); store = new OperationsStore(dir, () => now, () => ["unit-secret"]); await store.waitReady();
    expect(store.deliveries()[0]).toMatchObject({ sequence: saved.sequence, eventId: saved.eventId, attempts: 0 });
    expect(store.record(event).eventId).toBe(saved.eventId);
    expect(store.deliveries()).toHaveLength(1);
  });
  it("1/5/15/60 分钟独立重试；重启保留次数，耗尽后不无限重试", async () => {
    store.saveNotificationSettings(settings); store.record(event);
    const send = vi.fn().mockRejectedValue(Object.assign(new Error("password=unit-secret"), { code: "EAUTH" }));
    worker = new EmailNotifier(store, send);
    for (const minutes of [1, 5, 15, 60]) {
      await worker.tick();
      expect(store.deliveries()[0].nextAttemptAt).toBe(new Date(now + minutes * 60000).toISOString());
      const calls = send.mock.calls.length;
      await worker.tick(); expect(send).toHaveBeenCalledTimes(calls);
      now += minutes * 60000;
    }
    await worker.close(); store.close(); store = new OperationsStore(dir, () => now, () => ["unit-secret"]); await store.waitReady();
    worker = new EmailNotifier(store, send); await worker.tick();
    expect(store.deliveries()[0]).toMatchObject({ state: "failed", attempts: 5, nextAttemptAt: null, lastError: "SMTP_AUTH" });
    now += 10 * 86400000; await worker.tick(); expect(send).toHaveBeenCalledTimes(5);
    expect(JSON.stringify(store.deliveries())).not.toContain("password=");
    expect(store.resolve(store.activeEvents()[0].eventId)?.recoveredAt).not.toBeNull();
  });
  it("关闭自动通知暂停待发故障；显式测试仍可发送；同一 worker 不重入", async () => {
    store.saveNotificationSettings(settings); store.record(event);
    store.saveNotificationSettings({ ...settings, enabled: false });
    const send = vi.fn(); worker = new EmailNotifier(store, send);
    await worker.tick(); expect(send).not.toHaveBeenCalled();
    const test = store.enqueueTestEmail();
    let release!: () => void;
    send.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    const pending = worker.tick(); const duplicate = worker.tick();
    expect(duplicate).toBe(pending); expect(send).toHaveBeenCalledTimes(1);
    release(); await Promise.all([pending, duplicate]);
    expect(store.deliveries().find((item) => item.id === test.id)?.state).toBe("sent");
  });
  it("设置白名单、邮箱/TLS/端口验证，密码不允许写入", () => {
    for (const invalid of [null, { ...settings, password: "secret" }, { ...settings, port: 0 }, { ...settings, port: 65536 },
      { ...settings, tls: "weak" }, { ...settings, from: "a@b.test\r\nBCC:evil@e.test" }, { ...settings, host: "http://mail" },
      { ...settings, recipients: [] }, { ...settings, recipients: ["bad"] }, { ...settings, username: "name\n" }, { ...settings, constructor: "bad" }]) {
      expect(() => validateNotificationSettings(invalid)).toThrow();
    }
    expect(validateNotificationSettings({ ...settings, recipients: [...settings.recipients, ...settings.recipients] }).recipients).toHaveLength(1);
  });
  it("本地真实 SMTP 接收测试邮件，密码只从环境传入且不进入磁盘", async () => {
    const received: string[] = [];
    vi.stubEnv("A3ST_SMTP_PASSWORD", "smtp-test-password-only");
    smtp = new SMTPServer({ disabledCommands: ["STARTTLS"], allowInsecureAuth: true,
      onAuth(auth, _session, callback) {
        if (auth.username === "unit-user" && auth.password === "smtp-test-password-only") callback(null, { user: "unit-user" });
        else callback(new Error("认证失败"));
      },
      onData(stream, _session, callback) {
        const chunks: Buffer[] = []; stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => { received.push(Buffer.concat(chunks).toString("utf8")); callback(); });
      },
    });
    await new Promise<void>((resolve) => smtp!.listen(0, "127.0.0.1", resolve));
    const address = smtp.server.address();
    if (!address || typeof address === "string") throw new Error("本地 SMTP 未绑定");
    store.saveNotificationSettings({ ...settings, enabled: false, port: address.port, username: "unit-user" });
    const test = store.enqueueTestEmail(); worker = new EmailNotifier(store); await worker.tick();
    expect(store.deliveries()[0]).toMatchObject({ state: "sent", attempts: 1 });
    expect(received).toHaveLength(1); expect(received[0]).toContain(`<${test.id}@a3st.local>`);
    expect(received[0]).not.toContain("smtp-test-password-only");
    expect(fs.readFileSync(store.filePath).includes(Buffer.from("smtp-test-password-only"))).toBe(false);
    // 默认 STARTTLS 不可静默降级到此明文测试服务器。
    await expect(sendSmtpEmail({ ...settings, port: address.port, tls: "starttls" }, test)).rejects.toThrow();
  });
});
