import initSqlJs, { type Database, type SqlJsStatic, type SqlJsValue } from "sql.js";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { EmailDelivery, NotificationSettings, MaintenanceCheckpoint, OperationEvent, OperationEventInput, OperationEventPage } from "../types/operations.js";
import { DEFAULT_NOTIFICATION_SETTINGS, validateNotificationSettings } from "./notification-settings.js";
import type { MaintenanceDiscovery } from "../types/maintenance.js";

export class FutureOperationsCursor extends Error {
  constructor(public latestCursor: number) { super("事件游标超出当前数据库范围，请核对主机和游标后重新同步"); }
}
const RETRY_MINUTES = [1, 5, 15, 60];

/** 与维护检查点同事务保存的通知意图；固定字段匹配，不执行事件文本。 */
export type OperationNotice = { id: string } & (
  { kind: "record"; input: OperationEventInput; completed?: boolean } |
  { kind: "resolve"; batchIds?: string[]; reasonCode?: string; serverUuid?: string; modId?: number; exceptReasons?: string[]; exceptTypes?: OperationEvent["type"][] }
);

export class ExpiredOperationsCursor extends Error {
  constructor(public earliestCursor: number) { super("事件游标已过期，请从 earliestCursor 重新同步当前事件快照"); }
}

/** 禁止把认证输出/配置原文直接写入事件。额外屏蔽已知秘密与常见认证字段。 */
export function redactOperationText(value: string, secrets: string[] = []): string {
  let result = value;
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) result = result.split(secret).join("[REDACTED]");
  return result.replace(/((?:password|passwd|token|authorization|smtp[_ -]?pass|rconPassword)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi, "$1[REDACTED]")
    .replace(/(Bearer\s+)\S+/gi, "$1[REDACTED]").slice(0, 4000);
}

/** 低频运维数据每次变更同步原子落盘；损坏/写失败必须显式失败，不能退化到内存成功。 */
export class OperationsStore extends EventEmitter {
  private db!: Database;
  private SQL!: SqlJsStatic;
  private ready: Promise<void>;
  private closed = false;
  readonly filePath: string;
  constructor(dataDir: string, private now: () => number = Date.now, private secrets: () => string[] = () => []) {
    super();
    this.filePath = path.join(dataDir, "a3st_operations.db");
    this.ready = this.init();
  }
  private async init(): Promise<void> {
    this.SQL = await initSqlJs();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new this.SQL.Database(fs.existsSync(this.filePath) ? fs.readFileSync(this.filePath) : undefined);
    try {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS ops_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
        INSERT OR IGNORE INTO ops_meta VALUES ('earliest_cursor', 0);
        CREATE TABLE IF NOT EXISTS ops_events (event_id TEXT PRIMARY KEY, aggregate_key TEXT NOT NULL, recovered_at TEXT, payload TEXT NOT NULL);
        CREATE UNIQUE INDEX IF NOT EXISTS ops_active_reason ON ops_events(aggregate_key) WHERE recovered_at IS NULL;
        CREATE TABLE IF NOT EXISTS ops_changes (sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS ops_changes_event ON ops_changes(event_id);
        CREATE TABLE IF NOT EXISTS ops_maintenance (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ops_maintenance_requests (request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, batch_id TEXT NOT NULL UNIQUE);
        CREATE TABLE IF NOT EXISTS ops_notices (id TEXT PRIMARY KEY, payload TEXT);
        CREATE TABLE IF NOT EXISTS ops_discovery (key TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ops_settings (key TEXT PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS ops_email (id TEXT PRIMARY KEY, event_id TEXT, sequence INTEGER UNIQUE, state TEXT NOT NULL, next_attempt_at TEXT, payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS ops_email_due ON ops_email(state,next_attempt_at);
      `);
      this.persist();
      this.prune();
    } catch (error) { this.db.close(); this.closed = true; throw error; }
  }
  waitReady(): Promise<void> { return this.ready; }
  close(): void { if (!this.closed) { this.closed = true; this.db?.close(); this.removeAllListeners(); } }
  private assertReady(): void { if (!this.db || this.closed) throw new Error("运维数据库未就绪或已关闭"); }
  private rows(sql: string, params: SqlJsValue[] = []): Record<string, SqlJsValue>[] {
    this.assertReady();
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const result: Record<string, SqlJsValue>[] = [];
      while (stmt.step()) result.push(stmt.getAsObject() as Record<string, SqlJsValue>);
      return result;
    } finally { stmt.free(); }
  }
  private persist(): void {
    const temp = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      const fd = fs.openSync(temp, "wx", 0o600);
      try { fs.writeFileSync(fd, this.db.export()); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fs.renameSync(temp, this.filePath);
    } catch (error) { try { fs.unlinkSync(temp); } catch { /* 保留原数据库 */ } throw error; }
  }
  private transaction<T>(operation: () => T): T {
    this.assertReady();
    const before = this.db.export();
    try {
      this.db.run("BEGIN IMMEDIATE");
      const result = operation();
      this.db.run("COMMIT");
      this.persist();
      return result;
    } catch (error) {
      this.db.close();
      this.db = new this.SQL.Database(before);
      throw error;
    }
  }
  private key(input: OperationEventInput): string {
    return JSON.stringify([input.type, input.reasonCode, [...new Set(input.serverUuids)].sort(), [...new Set(input.modIds)].sort((a, b) => a - b), input.batchId]);
  }
  private sanitize(input: OperationEventInput): OperationEventInput {
    return {
      type: input.type, severity: input.severity, serverUuids: [...new Set(input.serverUuids)].sort(),
      modIds: [...new Set(input.modIds)].sort((a, b) => a - b), batchId: input.batchId,
      reasonCode: input.reasonCode, message: redactOperationText(input.message, this.secrets()),
      suggestedAction: redactOperationText(input.suggestedAction, this.secrets()), requiresAttention: input.requiresAttention,
    };
  }
  private append(event: OperationEvent, key: string): OperationEvent {
    this.db.run("INSERT INTO ops_changes(event_id,payload) VALUES (?,?)", [event.eventId, ""]);
    event.sequence = Number(this.rows("SELECT last_insert_rowid() AS id")[0].id);
    const json = JSON.stringify(event);
    this.db.run("UPDATE ops_changes SET payload=? WHERE sequence=?", [json, event.sequence]);
    this.db.run("INSERT INTO ops_events VALUES (?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET recovered_at=excluded.recovered_at,payload=excluded.payload", [event.eventId, key, event.recoveredAt, json]);
    // 事件与发送队列在同一事务中落盘，进程中断不会出现有事件但丢邮件的缝隙。
    const settings = this.notificationSettings();
    if (settings.enabled && event.requiresAttention && ["occurred", "changed", "recovered"].includes(event.change)) {
      const recovery = event.change === "recovered";
      this.insertEmail(settings, recovery ? "recovery" : "attention", event.eventId, event.sequence,
        recovery ? "[A3ST] 故障恢复" : "[A3ST] 需要人工介入",
        [`事件：${event.eventId}`, `原因：${event.reasonCode}`, `实例：${event.serverUuids.join(", ") || "主机"}`,
          `模组：${event.modIds.join(", ") || "无"}`, `批次：${event.batchId ?? "无"}`, `时间：${event.updatedAt}`,
          event.message, `建议：${event.suggestedAction}`, "确认已读不代表故障恢复。Service / 主机整体离线时无法自行发送邮件。"].join("\n"));
    }
    return event;
  }
  getEvent(id: string): OperationEvent | null {
    const row = this.rows("SELECT payload FROM ops_events WHERE event_id=?", [id])[0];
    return row ? JSON.parse(String(row.payload)) : null;
  }
  activeEvents(): OperationEvent[] {
    return this.rows("SELECT payload FROM ops_events WHERE recovered_at IS NULL").map((row) => JSON.parse(String(row.payload)));
  }
  record(input: OperationEventInput, completed = false, noticeId?: string): OperationEvent {
    const normalized = this.sanitize(input);
    const key = this.key(normalized);
    const row = this.rows(`SELECT payload FROM ops_events WHERE aggregate_key=? ${completed ? "" : "AND recovered_at IS NULL"} ORDER BY rowid DESC LIMIT 1`, [key])[0];
    const old: OperationEvent | null = row ? JSON.parse(String(row.payload)) : null;
    if (old && (completed || JSON.stringify(this.sanitize(old)) === JSON.stringify(normalized))) {
      if (noticeId) this.transaction(() => this.db.run("UPDATE ops_notices SET payload=NULL WHERE id=?", [noticeId]));
      return old;
    }
    const at = new Date(this.now()).toISOString();
    const event: OperationEvent = { ...normalized, eventId: old?.eventId ?? randomUUID(), sequence: 0,
      occurredAt: old?.occurredAt ?? at, updatedAt: at, recoveredAt: completed ? at : null,
      acknowledgedAt: old?.acknowledgedAt ?? null, change: old ? "changed" : "occurred" };
    const saved = this.transaction(() => {
      const result = this.append(event, key);
      if (noticeId) this.db.run("UPDATE ops_notices SET payload=NULL WHERE id=?", [noticeId]);
      return result;
    });
    this.emit("event", structuredClone(saved));
    return structuredClone(saved);
  }
  acknowledge(id: string): OperationEvent | null {
    const event = this.getEvent(id);
    if (!event || event.acknowledgedAt) return event;
    const at = new Date(this.now()).toISOString();
    return this.transaction(() => this.append({ ...event, acknowledgedAt: at, updatedAt: at, change: "acknowledged" }, this.key(event)));
  }
  resolve(id: string): OperationEvent | null {
    const event = this.getEvent(id);
    if (!event || event.recoveredAt) return event;
    const at = new Date(this.now()).toISOString();
    const saved = this.transaction(() => this.append({ ...event, recoveredAt: at, updatedAt: at, change: "recovered" }, this.key(event)));
    this.emit("event", structuredClone(saved));
    return structuredClone(saved);
  }
  events(after?: number, limit = 100): OperationEventPage {
    const earliestCursor = Number(this.rows("SELECT value FROM ops_meta WHERE key='earliest_cursor'")[0].value);
    const cursor = after ?? earliestCursor;
    if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("无效游标或页大小");
    if (cursor < earliestCursor) throw new ExpiredOperationsCursor(earliestCursor);
    const latestCursor = Math.max(earliestCursor, Number(this.rows("SELECT COALESCE(MAX(sequence),0) AS n FROM ops_changes")[0].n));
    if (cursor > latestCursor) throw new FutureOperationsCursor(latestCursor);
    const rows = this.rows("SELECT payload FROM ops_changes WHERE sequence>? ORDER BY sequence LIMIT ?", [cursor, limit + 1]);
    const items: OperationEvent[] = rows.slice(0, limit).map((row) => JSON.parse(String(row.payload)));
    return { items, nextCursor: items.at(-1)?.sequence ?? cursor, earliestCursor, hasMore: rows.length > limit };
  }
  prune(): void {
    const cutoff = new Date(this.now() - 30 * 86400000).toISOString();
    const expired = this.rows("SELECT event_id FROM ops_events WHERE recovered_at IS NOT NULL AND recovered_at < ?", [cutoff]);
    if (!expired.length) return;
    this.transaction(() => {
      let floor = Number(this.rows("SELECT value FROM ops_meta WHERE key='earliest_cursor'")[0].value);
      for (const row of expired) {
        const max = Number(this.rows("SELECT COALESCE(MAX(sequence),0) AS n FROM ops_changes WHERE event_id=?", [row.event_id])[0].n);
        floor = Math.max(floor, max);
        this.db.run("DELETE FROM ops_events WHERE event_id=?", [row.event_id]);
      }
      this.db.run("DELETE FROM ops_changes WHERE sequence<=?", [floor]);
      this.db.run("UPDATE ops_meta SET value=? WHERE key='earliest_cursor'", [floor]);
      // 过期游标必须报错；重同步仍可收到所有保留事件（尤其早于游标的未恢复故障）。
      for (const row of this.rows("SELECT aggregate_key,payload FROM ops_events")) {
        const event: OperationEvent = JSON.parse(String(row.payload));
        if (event.sequence <= floor) this.append({ ...event, change: "snapshot" }, String(row.aggregate_key));
      }
    });
  }
  notificationSettings(): NotificationSettings {
    const row = this.rows("SELECT payload FROM ops_settings WHERE key='smtp'")[0];
    return row ? validateNotificationSettings(JSON.parse(String(row.payload))) : structuredClone(DEFAULT_NOTIFICATION_SETTINGS);
  }
  saveNotificationSettings(value: unknown): NotificationSettings {
    const settings = validateNotificationSettings(value);
    this.transaction(() => this.db.run("INSERT INTO ops_settings VALUES ('smtp',?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload", [JSON.stringify(settings)]));
    return settings;
  }
  private insertEmail(settings: NotificationSettings, kind: EmailDelivery["kind"], eventId: string | null, sequence: number | null, subject: string, text: string): EmailDelivery {
    const at = new Date(this.now()).toISOString();
    const delivery: EmailDelivery = { id: randomUUID(), eventId, sequence, kind, state: "pending", attempts: 0,
      createdAt: at, nextAttemptAt: at, sentAt: null, lastError: null, from: settings.from, recipients: [...settings.recipients],
      subject, text: redactOperationText(text, this.secrets()) };
    this.db.run("INSERT INTO ops_email VALUES (?,?,?,?,?,?)", [delivery.id, eventId, sequence, delivery.state, at, JSON.stringify(delivery)]);
    return delivery;
  }
  enqueueTestEmail(): EmailDelivery {
    const settings = validateNotificationSettings(this.notificationSettings(), true);
    return this.transaction(() => this.insertEmail(settings, "test", null, null, "[A3ST] 测试邮件",
      "这是一封由管理员明确请求的测试邮件。默认仅通知需人工介入和故障恢复。Service / 主机整体离线时无法自行发邮件，请使用外部 Agent 监测查询失败。"));
  }
  deliveries(limit = 100): EmailDelivery[] {
    return this.rows("SELECT payload FROM ops_email ORDER BY rowid DESC LIMIT ?", [Math.min(100, Math.max(1, limit))]).map((row) => JSON.parse(String(row.payload)));
  }
  nextEmail(): EmailDelivery | null {
    const enabled = this.notificationSettings().enabled;
    const rows = this.rows("SELECT payload FROM ops_email WHERE state='pending' AND next_attempt_at<=? ORDER BY rowid", [new Date(this.now()).toISOString()]);
    for (const row of rows) {
      const delivery: EmailDelivery = JSON.parse(String(row.payload));
      if (enabled || delivery.kind === "test") return delivery;
    }
    return null;
  }
  settleEmail(id: string, errorCode: string | null): void {
    const row = this.rows("SELECT payload FROM ops_email WHERE id=? AND state='pending'", [id])[0];
    if (!row) return;
    const delivery: EmailDelivery = JSON.parse(String(row.payload));
    delivery.attempts++;
    // SMTP 返回文本可能包含密码、服务器回显和收件人；只存固定的安全原因码。
    delivery.lastError = errorCode === null ? null : ["SMTP_AUTH", "SMTP_TLS", "SMTP_CONNECT", "SMTP_REJECTED", "SMTP_PASSWORD_MISSING"].includes(errorCode) ? errorCode : "SMTP_SEND_FAILED";
    if (!errorCode) { delivery.state = "sent"; delivery.sentAt = new Date(this.now()).toISOString(); delivery.nextAttemptAt = null; }
    else {
      const delay = RETRY_MINUTES[delivery.attempts - 1];
      delivery.state = delay === undefined ? "failed" : "pending";
      delivery.nextAttemptAt = delay === undefined ? null : new Date(this.now() + delay * 60000).toISOString();
    }
    this.transaction(() => this.db.run("UPDATE ops_email SET state=?,next_attempt_at=?,payload=? WHERE id=?",
      [delivery.state, delivery.nextAttemptAt, JSON.stringify(delivery), id]));
  }
  discoveries(): MaintenanceDiscovery[] {
    return this.rows("SELECT payload FROM ops_discovery ORDER BY key").map((row) => JSON.parse(String(row.payload)));
  }
  /** 一轮物理副本检查整体落盘；未知不清除既有等待时长，只有确认同步才清除。 */
  saveDiscoveries(values: Omit<MaintenanceDiscovery, "pendingSince">[]): MaintenanceDiscovery[] {
    const old = new Map(this.discoveries().map((item) => [item.key, item]));
    return this.transaction(() => values.map((value) => {
      const previous = old.get(value.key);
      const pendingSince = value.status === "up_to_date" ? null : previous?.pendingSince ?? (value.status === "outdated" ? new Date(this.now()).toISOString() : null);
      const item = { ...value, pendingSince };
      this.db.run("INSERT INTO ops_discovery VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload", [item.key, JSON.stringify(item)]);
      return item;
    }));
  }
  /** 请求 ID 与初始检查点同一事务提交；相同 ID 不得换目标或重新执行。 */
  claimMaintenanceRequest(requestId: string, fingerprint: string, initial: MaintenanceCheckpoint): { created: boolean; checkpoint: MaintenanceCheckpoint } {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId) || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error("无效维护请求 ID");
    const old = this.rows("SELECT fingerprint,batch_id FROM ops_maintenance_requests WHERE request_id=?", [requestId])[0];
    if (old) {
      if (old.fingerprint !== fingerprint) throw new Error("维护请求 ID 已用于不同参数");
      const checkpoint = this.maintenance(String(old.batch_id));
      if (!checkpoint) throw new Error("维护请求检查点缺失，拒绝重复执行");
      return { created: false, checkpoint };
    }
    this.transaction(() => {
      this.db.run("INSERT INTO ops_maintenance VALUES (?,?)", [initial.id, JSON.stringify(initial)]);
      this.db.run("INSERT INTO ops_maintenance_requests VALUES (?,?,?)", [requestId, fingerprint, initial.id]);
    });
    return { created: true, checkpoint: structuredClone(initial) };
  }
  checkpoint(value: MaintenanceCheckpoint, notices: OperationNotice[] = []): void {
    this.transaction(() => {
      this.db.run("INSERT INTO ops_maintenance VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", [value.id, JSON.stringify(value)]);
      for (const notice of notices) {
        const safe = notice.kind === "record" ? { ...notice, input: this.sanitize(notice.input) } : notice;
        this.db.run("INSERT OR IGNORE INTO ops_notices VALUES (?,?)", [notice.id, JSON.stringify(safe)]);
      }
    });
  }
  /** 通知意图先独立落盘，再尝试投递；崩溃后由 flushNotices 补发，不丢也不重复发生已恢复故障。 */
  enqueueNotice(notice: OperationNotice): void {
    const safe = notice.kind === "record" ? { ...notice, input: this.sanitize(notice.input) } : notice;
    this.transaction(() => this.db.run("INSERT OR IGNORE INTO ops_notices VALUES (?,?)", [notice.id, JSON.stringify(safe)]));
  }
  pendingNotices(): number {
    return Number(this.rows("SELECT COUNT(*) AS n FROM ops_notices WHERE payload IS NOT NULL")[0].n);
  }
  /** 串行补发；事件、Email 与已投递标记原子提交，重启不重复发生已恢复故障。 */
  flushNotices(): void {
    for (const row of this.rows("SELECT id,payload FROM ops_notices WHERE payload IS NOT NULL ORDER BY rowid")) {
      const notice = JSON.parse(String(row.payload)) as OperationNotice;
      if (notice.kind === "record") this.record(notice.input, notice.completed, notice.id);
      else {
        const events = this.activeEvents().filter((event) =>
          (!notice.batchIds || !!event.batchId && notice.batchIds.includes(event.batchId)) &&
          (!notice.reasonCode || event.reasonCode === notice.reasonCode) &&
          (!notice.serverUuid || event.serverUuids.includes(notice.serverUuid)) &&
          (notice.modId === undefined || event.modIds.includes(notice.modId)) &&
          !notice.exceptReasons?.includes(event.reasonCode) && !notice.exceptTypes?.includes(event.type));
        const at = new Date(this.now()).toISOString();
        const saved = this.transaction(() => {
          const results = events.map((event) => this.append({ ...event, recoveredAt: at, updatedAt: at, change: "recovered" }, this.key(event)));
          this.db.run("UPDATE ops_notices SET payload=NULL WHERE id=?", [notice.id]);
          return results;
        });
        for (const event of saved) this.emit("event", structuredClone(event));
      }
    }
  }
  maintenance(id: string): MaintenanceCheckpoint | null {
    const row = this.rows("SELECT payload FROM ops_maintenance WHERE id=?", [id])[0];
    return row ? JSON.parse(String(row.payload)) : null;
  }
  checkpoints(): MaintenanceCheckpoint[] {
    // 按创建顺序返回：保留策略据最后一条成功批次判断“最近一批”，不能依赖隐式扫描顺序。
    return this.rows("SELECT payload FROM ops_maintenance ORDER BY rowid").map((row) => JSON.parse(String(row.payload)));
  }
}
