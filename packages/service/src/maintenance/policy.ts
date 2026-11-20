import type { MaintenanceEligibility, MaintenancePolicy, MaintenancePresence, MaintenanceWaitCode, MaintenanceWindow } from "../types/maintenance.js";

export const MAINTENANCE_THRESHOLDS = Object.freeze({ checkSeconds: 600, sampleSeconds: 10, idleSeconds: 600, onlineFreshSeconds: 30, maxWaitHours: 24, countdownSeconds: [600, 300, 60] as readonly number[] });
const MINUTE = 60000;
const MAX_WAIT = MAINTENANCE_THRESHOLDS.maxWaitHours * 3600000;

/** 旧配置缺省关闭；建议窗口必须人工确认，不自动授权停服。 */
export function defaultMaintenancePolicy(): MaintenancePolicy {
  return { enabled: false, template: "check_only", timeZone: "UTC", windows: [{ days: [0, 1, 2, 3, 4, 5, 6], start: "04:00", end: "05:00" }],
    protectedWindows: [], windowConfirmed: false, allowOccupied: false, occupiedConfirmed: false, expectedDurationMinutes: 60 };
}

export class InvalidMaintenancePolicy extends Error {}
function invalid(message: string): never { throw new InvalidMaintenancePolicy(message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("维护配置必须是对象");
  return value as Record<string, unknown>;
}
function minute(value: unknown): number {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return invalid("维护时段必须使用 HH:mm");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
function windows(value: unknown): MaintenanceWindow[] {
  if (!Array.isArray(value) || value.length > 32) return invalid("每组维护/保护时段最多 32 项");
  return value.map((raw) => {
    const item = object(raw);
    if (Object.keys(item).some((key) => !["days", "start", "end"].includes(key))) invalid("时段包含未知字段");
    if (!Array.isArray(item.days) || !item.days.length || item.days.length > 7 || item.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) invalid("星期必须是 0（周日）至 6（周六），且至少选择一天");
    if (minute(item.start) === minute(item.end)) invalid("开始与结束时间不能相同，请显式拆分全天时段");
    return { days: [...new Set(item.days as number[])].sort(), start: item.start as string, end: item.end as string };
  });
}
export function validateMaintenancePolicy(value: unknown): MaintenancePolicy {
  if (value === undefined) return defaultMaintenancePolicy();
  const data = object(value); const defaults = defaultMaintenancePolicy();
  if (Object.keys(data).some((key) => !Object.hasOwn(defaults, key))) invalid("维护配置包含未知字段");
  for (const key of ["enabled", "windowConfirmed", "allowOccupied", "occupiedConfirmed"]) if (typeof data[key] !== "boolean") invalid(`${key} 必须是布尔值`);
  if (typeof data.template !== "string" || !["check_only", "maintenance_window", "idle_first"].includes(data.template)) invalid("未知维护模板");
  if (typeof data.timeZone !== "string" || !data.timeZone.trim() || data.timeZone.length > 100) invalid("必须指定有效时区");
  try { new Intl.DateTimeFormat("en-US", { timeZone: data.timeZone as string }).format(); }
  catch { invalid("无效时区，请使用 UTC 或 Asia/Shanghai 等时区名称"); }
  const maintenanceWindows = windows(data.windows); const protectedWindows = windows(data.protectedWindows);
  if (!Number.isInteger(data.expectedDurationMinutes) || Number(data.expectedDurationMinutes) < 1 || Number(data.expectedDurationMinutes) > 1440) invalid("预计停服预算必须为 1—1440 分钟");
  if (data.enabled && data.template !== "check_only" && (!data.windowConfirmed || !maintenanceWindows.length)) invalid("启用自动维护前必须确认时区和维护窗口");
  if (data.allowOccupied && (data.template !== "idle_first" || !data.occupiedConfirmed || !data.windowConfirmed || !maintenanceWindows.length)) invalid("有人维护仅适用于常驻服，必须单独确认断开玩家的风险及维护窗口");
  return { enabled: data.enabled as boolean, template: data.template as MaintenancePolicy["template"], timeZone: (data.timeZone as string).trim(),
    windows: maintenanceWindows, protectedWindows, windowConfirmed: data.windowConfirmed as boolean,
    allowOccupied: data.allowOccupied as boolean, occupiedConfirmed: data.occupiedConfirmed as boolean, expectedDurationMinutes: Number(data.expectedDurationMinutes) };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function localTime(now: number, timeZone: string): { day: number; minute: number } {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    if (formatters.size >= 100) formatters.clear();
    formatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday")), minute: Number(value("hour")) * 60 + Number(value("minute")) };
}
function matches(window: MaintenanceWindow, local: { day: number; minute: number }): boolean {
  const start = minute(window.start); const end = minute(window.end);
  if (start < end) return window.days.includes(local.day) && local.minute >= start && local.minute < end;
  return (window.days.includes(local.day) && local.minute >= start) || (window.days.includes((local.day + 6) % 7) && local.minute < end);
}
export function isInMaintenanceWindows(value: MaintenanceWindow[], timeZone: string, now: number): boolean {
  if (!value.length) return false;
  const local = localTime(now, timeZone);
  return value.some((window) => matches(window, local));
}

function timeGate(policy: MaintenancePolicy, pendingSince: number, now: number): MaintenanceEligibility {
  const inWindow = isInMaintenanceWindows(policy.windows, policy.timeZone, now);
  const overdue = Number.isFinite(pendingSince) && now - pendingSince >= MAX_WAIT;
  const result: MaintenanceEligibility = { allowed: false, reasonCode: null, reason: "", inWindow, overdue, requiresCountdown: false };
  const wait = (reasonCode: MaintenanceWaitCode, reason: string) => ({ ...result, reasonCode, reason });
  if (!policy.enabled) return wait("POLICY_DISABLED", "该实例尚未授权自动维护");
  if (policy.template === "check_only") return wait("CHECK_ONLY", "该实例仅检查更新，不允许停服或下载");
  if (isInMaintenanceWindows(policy.protectedWindows, policy.timeZone, now)) return wait("PROTECTED_PERIOD", "当前处于活动保护时段");
  if (!Number.isFinite(pendingSince) || pendingSince > now) return wait("PENDING_TIME_UNKNOWN", "发现更新时间无效，不能推定已等待 24 小时");
  if (policy.template === "maintenance_window" && !inWindow) return wait("OUTSIDE_WINDOW", "等待授权维护窗口开始");
  if (policy.template === "idle_first" && overdue && !inWindow) return wait("WAITING_AUTHORIZED_WINDOW", "已等待至少 24 小时，转到下一个授权维护窗口处理");
  return { ...result, allowed: true };
}

/** 预览及倒计时结束使用同一门禁；在线未知永远不能解释成无人。 */
export function evaluateMaintenancePolicy(value: unknown, presence: MaintenancePresence, pendingSince: number, now = Date.now()): MaintenanceEligibility {
  const policy = validateMaintenancePolicy(value);
  if (!Number.isFinite(now)) throw new Error("维护检查时间无效");
  const gate = timeGate(policy, pendingSince, now);
  if (!gate.allowed) return gate;
  const wait = (reasonCode: MaintenanceWaitCode, reason: string) => ({ ...gate, allowed: false, reasonCode, reason });
  if (presence.running === null) return wait("PROCESS_UNKNOWN", "进程状态未知，不能开始维护");
  if (presence.observedAt === null || !Number.isFinite(presence.observedAt) || presence.observedAt > now || now - presence.observedAt > MAINTENANCE_THRESHOLDS.onlineFreshSeconds * 1000) return wait("ONLINE_UNKNOWN", "在线/进程采样已失效，需要重新查询");
  if (!presence.running) return { ...gate, reason: "实例已停止；维护完成不会自动启动此实例" };
  if (presence.onlineCount === null || !Number.isSafeInteger(presence.onlineCount) || presence.onlineCount < 0) return wait("ONLINE_UNKNOWN", "RCon 在线人数未知，保持运行并等待查询恢复");
  if (presence.onlineCount === 0 && presence.idleSince !== null && Number.isFinite(presence.idleSince) && presence.idleSince <= presence.observedAt && now - presence.idleSince >= MAINTENANCE_THRESHOLDS.idleSeconds * 1000) {
    return { ...gate, reason: "已连续无人至少 10 分钟" };
  }
  if (policy.template === "idle_first" && gate.overdue && gate.inWindow && policy.allowOccupied) {
    return { ...gate, requiresCountdown: true, reason: "已等待至少 24 小时，窗口内有人维护已授权；必须完成 10／5／1 分钟广播并再次检查" };
  }
  return presence.onlineCount > 0 ? wait("PLAYERS_PRESENT", "仍有玩家在线，保持运行并等待；未获准断开玩家") : wait("WAITING_IDLE", "尚未连续无人 10 分钟");
}

interface TrackedPresence extends MaintenancePresence { session: string | null }
/** 内存采样链不跨 Service 重启复用；任一未知、采样中断或进程会话变化都重置无人计时。 */
export class MaintenanceIdleTracker {
  private entries = new Map<string, TrackedPresence>();
  observe(uuid: string, sample: { running: boolean | null; onlineCount: number | null; session: string | null }, now = Date.now()): MaintenancePresence {
    const old = this.entries.get(uuid);
    const validSession = sample.running === false || Boolean(sample.session);
    const running = validSession ? sample.running : null;
    const onlineCount = running === true && Number.isSafeInteger(sample.onlineCount) && Number(sample.onlineCount) >= 0 ? sample.onlineCount : null;
    const continuous = old?.running === true && old.session === sample.session && old.observedAt !== null && now >= old.observedAt && now - old.observedAt <= MAINTENANCE_THRESHOLDS.onlineFreshSeconds * 1000;
    const idleSince = running === true && onlineCount === 0 ? continuous && old?.idleSince !== null ? old!.idleSince : now : null;
    const entry = { running, onlineCount, observedAt: now, idleSince, session: sample.session };
    this.entries.set(uuid, entry);
    return { running, onlineCount, observedAt: now, idleSince };
  }
  get(uuid: string): MaintenancePresence {
    const entry = this.entries.get(uuid);
    return entry ? { running: entry.running, onlineCount: entry.onlineCount, observedAt: entry.observedAt, idleSince: entry.idleSince } : { running: null, onlineCount: null, observedAt: null, idleSince: null };
  }
  forget(uuid: string): void { this.entries.delete(uuid); }
}

/** 只预测共同时间许可，不预测玩家人数；无交集结果明确限定未来 14 天，不承诺永远无交集。 */
export function findCommonMaintenanceTime(values: unknown[], pendingSince: number, from = Date.now()): { at: number | null; searchedThrough: number } {
  if (!Number.isFinite(from) || !Number.isFinite(pendingSince) || pendingSince > from) throw new Error("共同维护时间查询无效");
  const policies = values.map(validateMaintenancePolicy);
  const searchedThrough = from + 14 * 86400000;
  if (!policies.length || policies.some((policy) => !policy.enabled || policy.template === "check_only")) return { at: null, searchedThrough };
  for (let now = from; now < searchedThrough; now = (Math.floor(now / MINUTE) + 1) * MINUTE) {
    if (policies.every((policy) => timeGate(policy, pendingSince, now).allowed)) return { at: now, searchedThrough };
  }
  return { at: null, searchedThrough };
}
