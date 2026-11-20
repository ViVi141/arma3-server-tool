import { describe, expect, it } from "vitest";
import { defaultMaintenancePolicy, evaluateMaintenancePolicy, findCommonMaintenanceTime, isInMaintenanceWindows, MaintenanceIdleTracker, validateMaintenancePolicy } from "./policy.js";
import type { MaintenancePolicy, MaintenancePresence } from "../types/maintenance.js";

const at = (value: string) => Date.parse(value);
const now = at("2026-11-23T04:30:00Z"); // 周一
const policy = (patch: Partial<MaintenancePolicy> = {}): MaintenancePolicy => ({ ...defaultMaintenancePolicy(), enabled: true, template: "maintenance_window", windowConfirmed: true, ...patch });
const idle = (time = now): MaintenancePresence => ({ running: true, onlineCount: 0, idleSince: time - 600000, observedAt: time });
const run = (config = policy(), presence = idle(), pending = now - 3600000, time = now) => evaluateMaintenancePolicy(config, presence, pending, time);

describe("逐服维护策略", () => {
  it("旧配置默认关闭，仅读策略永远不准下载；自动窗口和有人维护需独立确认", () => {
    expect(evaluateMaintenancePolicy(undefined, idle(), now, now).reasonCode).toBe("POLICY_DISABLED");
    expect(run(policy({ template: "check_only" })).reasonCode).toBe("CHECK_ONLY");
    expect(() => validateMaintenancePolicy(policy({ windowConfirmed: false }))).toThrow("确认");
    expect(() => validateMaintenancePolicy(policy({ template: "idle_first", allowOccupied: true }))).toThrow("单独确认");
    expect(() => validateMaintenancePolicy(policy({ allowOccupied: true, occupiedConfirmed: true }))).toThrow("常驻服");
    expect(validateMaintenancePolicy(policy({ template: "idle_first", allowOccupied: true, occupiedConfirmed: true })).allowOccupied).toBe(true);
    const first = defaultMaintenancePolicy(); first.windows[0].days.pop();
    expect(defaultMaintenancePolicy().windows[0].days).toHaveLength(7);
  });
  it.each<Record<string, unknown>>([
    { timeZone: "Mars/Olympus" }, { enabled: "true" }, { windows: [] }, { allowOccupied: true }, { template: "cron" },
    { expectedDurationMinutes: 0 }, { expectedDurationMinutes: 1441 }, { windows: [{ days: [], start: "04:00", end: "05:00" }] },
    { windows: [{ days: [7], start: "04:00", end: "05:00" }] }, { windows: [{ days: [1], start: "24:00", end: "05:00" }] },
    { windows: [{ days: [1], start: "04:00", end: "04:00" }] }, { windows: [{ days: [1], start: "04:00", end: "05:00", command: "anything" }] },
    { constructor: "unknown" }, { password: "not-accepted" },
  ])("拒绝无效/模糊配置 %j", (patch) => { expect(() => validateMaintenancePolicy({ ...policy(), ...patch })).toThrow(); });
  it("跨午夜的结束部分属于开始日，结束时刻排除，时区不跟随主机", () => {
    const windows = [{ days: [1], start: "23:00", end: "01:00" }];
    expect(isInMaintenanceWindows(windows, "Asia/Shanghai", at("2026-11-23T14:59:00Z"))).toBe(false);
    expect(isInMaintenanceWindows(windows, "Asia/Shanghai", at("2026-11-23T15:00:00Z"))).toBe(true);
    expect(isInMaintenanceWindows(windows, "Asia/Shanghai", at("2026-11-23T16:59:59Z"))).toBe(true);
    expect(isInMaintenanceWindows(windows, "Asia/Shanghai", at("2026-11-23T17:00:00Z"))).toBe(false);
    expect(isInMaintenanceWindows(windows, "UTC", at("2026-11-23T16:00:00Z"))).toBe(false);
  });
  it("DST 回拨重复时段都匹配，跳过的本地时间不伪造窗口", () => {
    const fall = [{ days: [0], start: "01:00", end: "02:00" }];
    for (const time of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"]) expect(isInMaintenanceWindows(fall, "America/New_York", at(time))).toBe(true);
    const spring = [{ days: [0], start: "02:00", end: "03:00" }];
    for (const time of ["2026-03-08T06:59:00Z", "2026-03-08T07:00:00Z"]) expect(isInMaintenanceWindows(spring, "America/New_York", at(time))).toBe(false);
  });
  it("保护时段覆盖所有模板和有人授权，结束前玩家变化仍会阻止停服", () => {
    expect(run().allowed).toBe(true);
    expect(run(policy(), { ...idle(), onlineCount: 1, idleSince: null }).reasonCode).toBe("PLAYERS_PRESENT");
    const protectedWindows = [{ days: [1], start: "04:00", end: "05:00" }];
    expect(run(policy({ protectedWindows })).reasonCode).toBe("PROTECTED_PERIOD");
    expect(run(policy({ template: "idle_first", allowOccupied: true, occupiedConfirmed: true, protectedWindows }), { ...idle(), onlineCount: 10 }, now - 86400000).reasonCode).toBe("PROTECTED_PERIOD");
    expect(run(policy(), idle(now + 1800000), now, now + 1800000).reasonCode).toBe("OUTSIDE_WINDOW");
  });
  it("无人持续时间、在线未知、采样过期和进程未知都不误判", () => {
    expect(run(policy(), { ...idle(), idleSince: now - 599999 }).reasonCode).toBe("WAITING_IDLE");
    expect(run(policy(), { ...idle(), onlineCount: null }).reasonCode).toBe("ONLINE_UNKNOWN");
    expect(run(policy(), { ...idle(), observedAt: now - 30001 }).reasonCode).toBe("ONLINE_UNKNOWN");
    expect(run(policy(), { ...idle(), observedAt: now + 1 }).reasonCode).toBe("ONLINE_UNKNOWN");
    for (const observedAt of [NaN, Infinity, -Infinity]) expect(run(policy(), { ...idle(), observedAt }).reasonCode).toBe("ONLINE_UNKNOWN");
    for (const idleSince of [NaN, Infinity, -Infinity]) expect(run(policy(), { ...idle(), idleSince }).reasonCode).toBe("WAITING_IDLE");
    expect(() => findCommonMaintenanceTime([policy()], now, NaN)).toThrow();
    expect(() => findCommonMaintenanceTime([policy()], now + 1, now)).toThrow();
    expect(run(policy(), { ...idle(), running: null }).reasonCode).toBe("PROCESS_UNKNOWN");
    expect(run(policy(), { ...idle(), running: false, onlineCount: null })).toMatchObject({ allowed: true, requiresCountdown: false });
    expect(run(policy(), idle(), now + 1).reasonCode).toBe("PENDING_TIME_UNKNOWN");
  });
  it("常驻服未满 24 小时可窗外空闲更新，超时后转授权窗口；有人需完整倒计时", () => {
    const config = policy({ template: "idle_first" }); const outside = at("2026-11-23T08:00:00Z");
    expect(run(config, idle(outside), outside - 86399999, outside).allowed).toBe(true);
    expect(run(config, idle(outside), outside - 86400000, outside).reasonCode).toBe("WAITING_AUTHORIZED_WINDOW");
    expect(run(config, { ...idle(), onlineCount: 1 }, now - 86400000).reasonCode).toBe("PLAYERS_PRESENT");
    const occupied = { ...config, allowOccupied: true, occupiedConfirmed: true };
    expect(run(occupied, { ...idle(), onlineCount: 1 }, now - 86400000)).toMatchObject({ allowed: true, requiresCountdown: true });
    expect(run(occupied, { ...idle(), onlineCount: null }, now - 86400000).reasonCode).toBe("ONLINE_UNKNOWN");
    expect(run(occupied, { ...idle(), onlineCount: 1 }, now - 1000).reasonCode).toBe("PLAYERS_PRESENT");
  });
  it("三服共同窗口受每服时区和保护时段约束；无交集给出明确搜索范围", () => {
    const shanghai = policy({ timeZone: "Asia/Shanghai", windows: [{ days: [1], start: "12:00", end: "13:00" }] });
    const protectedFirstHalf = policy({ protectedWindows: [{ days: [1], start: "04:00", end: "04:30" }] });
    const start = at("2026-11-23T03:00:00Z");
    expect(findCommonMaintenanceTime([policy(), shanghai, protectedFirstHalf], start - 86400000, start).at).toBe(now);
    const other = policy({ windows: [{ days: [1], start: "05:00", end: "06:00" }] });
    expect(findCommonMaintenanceTime([policy(), other], start - 86400000, start)).toEqual({ at: null, searchedThrough: start + 14 * 86400000 });
    expect(findCommonMaintenanceTime([policy(), undefined], start, start).at).toBeNull();
  });
});

describe("连续无人采样", () => {
  it("按实例隔离，未知/间断/会话变化/时钟回拨都会重置，重启不复用", () => {
    const tracker = new MaintenanceIdleTracker(); const sample = { running: true, onlineCount: 0, session: "1:startA" };
    for (let i = 0; i <= 60; i++) tracker.observe("one", sample, now + i * 10000);
    expect(tracker.get("one").idleSince).toBe(now); expect(tracker.get("two").running).toBeNull();
    tracker.observe("one", { ...sample, onlineCount: null }, now + 610000);
    expect(tracker.get("one").idleSince).toBeNull();
    tracker.observe("one", sample, now + 620000); expect(tracker.get("one").idleSince).toBe(now + 620000);
    tracker.observe("one", sample, now + 660000); expect(tracker.get("one").idleSince).toBe(now + 660000);
    tracker.observe("one", { ...sample, session: "1:startB" }, now + 670000); expect(tracker.get("one").idleSince).toBe(now + 670000);
    tracker.observe("one", { ...sample, session: null }, now + 680000); expect(tracker.get("one").running).toBeNull();
    tracker.observe("one", sample, now + 690000); tracker.observe("one", sample, now + 680000); expect(tracker.get("one").idleSince).toBe(now + 680000);
    expect(new MaintenanceIdleTracker().get("one").idleSince).toBeNull();
    tracker.forget("one"); expect(tracker.get("one").running).toBeNull();
  });
});
