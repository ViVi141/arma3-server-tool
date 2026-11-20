import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";
import { buildHealthPbo, deployHealthMod } from "./mod.js";
import { HealthRptTail, parseHeartbeat } from "./tail.js";
import { ServerHealthService } from "./service.js";
import { healthConfigurationIssues, validateHealthConfig, startupTimeoutSeconds } from "./configuration.js";
import { buildStartCommandLine, buildHeadlessClientCommandLine, getConfigRoot, writeAll } from "../config/game-config-writer.js";
import { RptLogReader } from "../logs/reader.js";
import { ConfigStore } from "../config/store.js";

const { online } = vi.hoisted(() => ({ online: vi.fn() }));
vi.mock("../rcon/helpers.js", () => ({ countOnlinePlayers: online }));
let dir: string;
let now: number;
let config: ServerConfigPackage;
let processState: { isRunning: boolean; pid?: number };
let sessionIdentity: string | null;
let app: FastifyInstance;
let service: ServerHealthService;
let root: string;
let rpt: string;
const uuid = "health-instance";

function heartbeat(seq: number, epoch = 1, at = now, mission = "无人测试"): string {
  const date = new Date(at);
  const utc = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()];
  const codes = (text: string) => JSON.stringify(Array.from(text, (c) => c.codePointAt(0)));
  return `12:00:00 "A3ST_HEALTH_V1|${epoch}|${seq}|${codes(mission)}|${codes("Altis")}|${1000 + seq * 15}|${seq * 15}|48.5|${JSON.stringify(utc)}"\n`;
}
function append(seq: number, epoch = 1) { fs.appendFileSync(rpt, heartbeat(seq, epoch)); }

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-health-"));
  now = Date.UTC(2026, 5, 1);
  root = getConfigRoot(dir, uuid);
  rpt = path.join(root, "server.rpt");
  deployHealthMod(root);
  fs.mkdirSync(path.join(dir, "mpmissions"));
  fs.writeFileSync(path.join(dir, "mpmissions", "无人测试.Altis.pbo"), "mission");
  fs.writeFileSync(rpt, "");
  config = { formatVersion: 2, server: { serverDir: dir }, startup: { autoInit: true },
    basic: { persistent: true, noLogs: false }, tasks: { missions: [{ template: "无人测试.Altis.pbo" }] },
    battleye: { rconPassword: "test-only" }, health: { enabled: true, unattended: true } };
  processState = { isRunning: true, pid: 101 };
  online.mockReset().mockResolvedValue(0);
  app = { configStore: { load: () => structuredClone(config), listServers: () => [{ uuid }] }, rptLogReader: new RptLogReader(),
    processManager: { getState: vi.fn(async () => ({ ...processState })), start: vi.fn(), kill: vi.fn() } } as unknown as FastifyInstance;
  sessionIdentity = "birth-1";
  service = new ServerHealthService(app, () => now, async () => sessionIdentity);
});
afterEach(() => { service.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe("独立健康模组与配置", () => {
  it("PBO 确定性、未压缩、prefix 与校验完整；只在应用配置时部署", () => {
    const bytes = buildHealthPbo();
    expect(bytes.equals(buildHealthPbo())).toBe(true);
    expect(bytes.readUInt32LE(1)).toBe(0x56657273);
    expect(bytes.subarray(21, 40).toString()).toContain("prefix\0a3st_health\0");
    expect(bytes.subarray(-20).equals(createHash("sha1").update(bytes.subarray(0, -21)).digest())).toBe(true);
    let offset = 21 + Buffer.byteLength("prefix\0a3st_health\0\0");
    const entries: { name: string; size: number }[] = [];
    while (bytes[offset] !== 0) {
      const end = bytes.indexOf(0, offset);
      const name = bytes.subarray(offset, end).toString();
      offset = end + 1;
      expect(bytes.readUInt32LE(offset)).toBe(0);
      expect(bytes.readUInt32LE(offset + 12)).toBe(0);
      entries.push({ name, size: bytes.readUInt32LE(offset + 16) });
      offset += 20;
    }
    offset += 21;
    expect(entries.map((e) => e.name)).toEqual(["config.cpp", "fn_heartbeat.sqf"]);
    expect(offset + entries.reduce((sum, e) => sum + e.size, 0)).toBe(bytes.length - 21);
    expect(bytes.toString()).toContain("postInit = 1");
    expect(bytes.toString()).toContain("!isServer || !isDedicated");
    expect(bytes.toString()).toContain("uiSleep 15");
    const command = buildStartCommandLine(uuid, config);
    expect(command).toContain(`-serverMod=${path.join(root, "@a3st_health")}`);
    expect(command).not.toContain("-filePatching");
    const hc = buildHeadlessClientCommandLine(uuid, config);
    expect(hc).not.toContain("@a3st_health");
    expect(hc).toContain(`-profiles=${path.join(root, "headless")}`);
    expect(writeAll(uuid, config).success).toBe(true);
    expect(fs.readFileSync(path.join(root, "server.cfg"), "utf8")).toContain("persistent=1");
  });
  it("旧配置默认不启用；健康配置跨重启保存且不修改既有任务", () => {
    expect(startupTimeoutSeconds({ formatVersion: 2 })).toBe(600);
    expect(buildStartCommandLine(uuid, { formatVersion: 2, server: { serverDir: dir } })).not.toContain("@a3st_health");
    const store = new ConfigStore(path.join(dir, "data"));
    store.save(uuid, config);
    expect(new ConfigStore(path.join(dir, "data")).load(uuid)?.health).toEqual(config.health);
    expect(new ConfigStore(path.join(dir, "data")).load(uuid)?.tasks?.missions).toEqual(config.tasks?.missions);
  });
  it("缺少模板与无效超时阻止设置，配置不足给具体原因", () => {
    config.health!.startupTimeoutSeconds = 119;
    expect(() => validateHealthConfig(config)).toThrow("120—1800");
    config.health!.startupTimeoutSeconds = 1801;
    expect(() => validateHealthConfig(config)).toThrow();
    config.health!.startupTimeoutSeconds = 600;
    config.tasks!.missions = [];
    expect(() => validateHealthConfig(config)).toThrow("启动任务模板");
    config.basic = { noLogs: true };
    config.startup = { autoInit: false, startArgs: "-profiles=other" };
    const issues = healthConfigurationIssues(config).join(";");
    for (const text of ["autoInit", "persistent", "noLogs", "覆盖项", "模板"]) expect(issues).toContain(text);
    expect(writeAll(uuid, config).success).toBe(false);
  });
});

describe("RPT 增量与会话证据", () => {
  it("解析 Unicode 任务、地图、序号、运行时间和 FPS，拒绝过期与损坏证据", () => {
    expect(parseHeartbeat(heartbeat(1), now)).toMatchObject({ sequence: 1, mission: "无人测试", world: "Altis", fps: 48.5 });
    expect(parseHeartbeat(heartbeat(1, 1, now - 91000), now)).toBeNull();
    expect(parseHeartbeat(heartbeat(1, 1, now + 31000), now)).toBeNull();
    expect(parseHeartbeat(heartbeat(1).replace("48.5", "NaN"), now)).toBeNull();
    expect(parseHeartbeat("普通日志增长", now)).toBeNull();
    expect(parseHeartbeat(heartbeat(1).replace("[2026,6,1,0,0,0,0]", "[2026,5,32,0,0,0,0]"), now)).toBeNull();
    expect(parseHeartbeat(heartbeat(1).replace("[2026,6,1,0,0,0,0]", "[2026,5,31,24,0,0,0]"), now)).toBeNull();
  });
  it("接管跳过旧内容，不完整行跨采样保留，截断和同长重写丢弃旧证据", () => {
    append(1);
    const tail = new HealthRptTail(root, [rpt]);
    expect(tail.read(rpt).lines).toEqual([]);
    const text = heartbeat(2);
    fs.appendFileSync(rpt, text.slice(0, 30));
    expect(tail.read(rpt).lines).toEqual([]);
    fs.appendFileSync(rpt, text.slice(30));
    expect(tail.read(rpt).lines).toHaveLength(1);
    fs.writeFileSync(rpt, heartbeat(3));
    expect(tail.read(rpt)).toMatchObject({ reset: true, lines: [heartbeat(3).trim()] });
    fs.writeFileSync(rpt, heartbeat(4));
    expect(tail.read(rpt).reset).toBe(true);
  });
  it("拒绝读到 profile 外的文件", () => {
    const tail = new HealthRptTail(root, []);
    const outside = path.join(dir, "other.rpt");
    fs.writeFileSync(outside, heartbeat(1));
    expect(() => tail.read(outside)).toThrow("不属于此实例");
  });
  it("超过读取预算与旧残行不能贡献心跳，junction 不能跨实例", () => {
    const partial = heartbeat(1).trimEnd();
    fs.writeFileSync(rpt, partial);
    const tail = new HealthRptTail(root, [rpt]);
    fs.appendFileSync(rpt, `补完旧行\n${heartbeat(2)}`);
    expect(tail.read(rpt).lines).toEqual([heartbeat(2).trim()]);
    fs.appendFileSync(rpt, "x".repeat(2 * 1024 * 1024) + `\n${heartbeat(3)}`);
    expect(tail.read(rpt)).toMatchObject({ reset: true, lines: [heartbeat(3).trim()] });
    const outside = path.join(dir, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "server.rpt"), heartbeat(4));
    const link = path.join(root, "redirect");
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    expect(() => tail.read(path.join(link, "server.rpt"))).toThrow("不属于此实例");
  });
  it("采样重入合并；RCon 等待期间换会话或关闭不发布旧健康", async () => {
    service.prepareStart(uuid, config); service.bindProcess(uuid, 101);
    append(1); await service.sample(uuid);
    now += 15000; append(2);
    let resolveOnline!: (value: number) => void;
    online.mockImplementationOnce(() => new Promise<number>((resolve) => { resolveOnline = resolve; }));
    const pending = service.sample(uuid);
    expect(service.sample(uuid)).toBe(pending);
    await vi.waitFor(() => expect(resolveOnline).toBeTypeOf("function"));
    service.forget(uuid);
    service.prepareStart(uuid, config); service.bindProcess(uuid, 101);
    resolveOnline(0);
    expect(await pending).toMatchObject({ state: "unverified", heartbeat: null });
    const listener = vi.fn();
    service.on("change", listener);
    service.close();
    await service.sample(uuid);
    expect(listener).not.toHaveBeenCalled();
  });
  it("零玩家时两条递增心跳加 RCon 响应才健康，重复序号不刷新存活", async () => {
    service.prepareStart(uuid, config); service.bindProcess(uuid, 101);
    expect((await service.sample(uuid)).state).toBe("starting");
    append(1);
    expect((await service.sample(uuid)).state).toBe("starting");
    now += 15000; append(2);
    const healthy = await service.sample(uuid);
    expect(healthy).toMatchObject({ state: "healthy", onlineCount: 0, fps: 48.5, consecutiveHeartbeats: 2 });
    expect(healthy.publicReachability).toBe("unverified");
    now += 90000; append(2);
    expect(await service.sample(uuid)).toMatchObject({ state: "unhealthy", fps: null });
    expect(app.processManager.start).not.toHaveBeenCalled();
  });
  it("Service 接管及 PID 改变后必须等待新心跳", async () => {
    append(1); append(2);
    expect(await service.sample(uuid)).toMatchObject({ state: "unverified", heartbeat: null });
    now += 15000; append(3); await service.sample(uuid);
    now += 15000; append(4);
    expect((await service.sample(uuid)).state).toBe("healthy");
    processState.pid = 202;
    expect(await service.sample(uuid)).toMatchObject({ state: "unverified", heartbeat: null, consecutiveHeartbeats: 0 });
  });
  it("PID 相同但启动身份改变必须重建基线，身份不可读不能继续报健康", async () => {
    service.prepareStart(uuid, config); service.bindProcess(uuid, 101);
    append(1); await service.sample(uuid);
    now += 15000; append(2); expect((await service.sample(uuid)).state).toBe("healthy");
    sessionIdentity = "birth-2";
    expect(await service.sample(uuid)).toMatchObject({ state: "unverified", heartbeat: null, consecutiveHeartbeats: 0 });
    now += 15000; append(3); await service.sample(uuid);
    now += 15000; append(4); expect((await service.sample(uuid)).state).toBe("healthy");
    sessionIdentity = null;
    expect(await service.sample(uuid)).toMatchObject({ state: "unverified", heartbeat: null });
  });
  it("spawn 前的空进程采样不删除本次启动基线", async () => {
    service.prepareStart(uuid, config);
    processState = { isRunning: false };
    expect((await service.sample(uuid)).state).toBe("starting");
    processState = { isRunning: true, pid: 101 };
    service.bindProcess(uuid, 101);
    append(1); expect((await service.sample(uuid)).state).toBe("starting");
    now += 15000; append(2); expect((await service.sample(uuid)).state).toBe("healthy");
  });
  it("轮转、任务切换都重新建立连续证据；RCon 失败人数未知", async () => {
    service.prepareStart(uuid, config); service.bindProcess(uuid, 101);
    append(1); await service.sample(uuid);
    now += 15000; append(2); expect((await service.sample(uuid)).state).toBe("healthy");
    now += 15000; append(1, 100); expect((await service.sample(uuid)).consecutiveHeartbeats).toBe(1);
    rpt = path.join(root, "rotated.rpt");
    fs.writeFileSync(rpt, heartbeat(3, 100));
    fs.utimesSync(rpt, new Date("2030-01-01"), new Date("2030-01-01"));
    expect((await service.sample(uuid)).consecutiveHeartbeats).toBe(1);
    now += 15000; append(4, 100);
    online.mockResolvedValue(null);
    expect(await service.sample(uuid)).toMatchObject({ state: "unhealthy", rconResponsive: false, onlineCount: null });
  });
  it("维护界面保持维护中，但执行器可获取真实健康证据；会话变化丢弃旧证据", async () => {
    service.prepareStart(uuid, config); service.bindProcess(uuid, 101); service.setMaintenance(uuid, true);
    append(1); expect((await service.getMaintenanceEvidence(uuid)).state).toBe("starting");
    now += 15000; append(2);
    const evidence = await service.getMaintenanceEvidence(uuid);
    expect(evidence).toMatchObject({ state: "healthy", consecutiveHeartbeats: 2, onlineCount: 0 });
    expect((await service.get(uuid)).state).toBe("maintenance");
    evidence.state = "unhealthy";
    expect((await service.getMaintenanceEvidence(uuid)).state).toBe("healthy");
    sessionIdentity = "new-birth";
    expect(await service.getMaintenanceEvidence(uuid)).toMatchObject({ state: "unverified", heartbeat: null });
    expect((await service.get(uuid)).state).toBe("maintenance");
  });
  it("停止、维护中、启动超时及采集异常有明确状态", async () => {
    service.prepareStart(uuid, config); service.bindProcess(uuid, 101);
    now += 600000;
    expect((await service.sample(uuid)).state).toBe("unhealthy");
    service.setMaintenance(uuid, true);
    expect((await service.sample(uuid)).state).toBe("maintenance");
    service.setMaintenance(uuid, false);
    processState = { isRunning: false };
    expect(await service.sample(uuid)).toMatchObject({ state: "stopped", heartbeat: null });
    vi.mocked(app.processManager.getState).mockRejectedValueOnce(new Error("cannot probe"));
    expect(await service.sample(uuid)).toMatchObject({ state: "unverified", processAlive: null });
  });
  it("新实例缺少模组或 noLogs 不用等待玩家掩盖配置不足", async () => {
    config.basic!.noLogs = true;
    const result = await service.sample(uuid);
    expect(result.state).toBe("unhealthy");
    expect(result.configurationIssues.join()).toContain("noLogs");
  });
});
