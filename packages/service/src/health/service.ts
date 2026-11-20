import { EventEmitter } from "node:events";
import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";
import type { MissionHeartbeat, ServerHealthData } from "../types/health.js";
import { getConfigRoot } from "../config/game-config-writer.js";
import { countOnlinePlayers } from "../rcon/helpers.js";
import { healthConfigurationIssues, HEALTH_THRESHOLDS, startupTimeoutSeconds } from "./configuration.js";
import { healthModMatches } from "./mod.js";
import { HealthRptTail, parseHeartbeat } from "./tail.js";
import { getProcessSessionIdentity } from "../process/identity.js";

interface Session {
  pid: number | null;
  processIdentity: string | null;
  managed: boolean;
  startedAt: number;
  configKey: string;
  tail: HealthRptTail;
  heartbeat: MissionHeartbeat | null;
  consecutive: number;
}

/** 健康检查只提供证据和状态变更，不执行重启。 */
export class ServerHealthService extends EventEmitter {
  private sessions = new Map<string, Session>();
  private snapshots = new Map<string, ServerHealthData>();
  private evidence = new Map<string, ServerHealthData>();
  private inFlight = new Map<string, Promise<ServerHealthData>>();
  private maintenance = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  constructor(private app: FastifyInstance, private now: () => number = Date.now,
    private processIdentity: (pid: number) => Promise<string | null> = getProcessSessionIdentity) { super(); }

  start(): void {
    if (this.timer) return;
    this.closed = false;
    this.timer = setInterval(() => { void this.sampleAll(); }, HEALTH_THRESHOLDS.sampleSeconds * 1000);
    this.timer.unref();
    void this.sampleAll();
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.removeAllListeners();
  }

  private configKey(config: ServerConfigPackage): string {
    return JSON.stringify([config.server?.serverDir, config.health?.enabled]);
  }

  /** 在 spawn 前建立 RPT 基线，避免把上一次启动的日志作为本次证据。 */
  prepareStart(uuid: string, config: ServerConfigPackage): void {
    this.newSession(uuid, config, null, true);
  }

  bindProcess(uuid: string, pid: number): void {
    const session = this.sessions.get(uuid);
    if (session) session.pid = pid;
  }

  forget(uuid: string): void {
    this.sessions.delete(uuid);
    this.snapshots.delete(uuid);
    this.evidence.delete(uuid);
  }

  /** 仅供维护执行器确认新会话；对外仍显示维护中，不提前发出恢复事件。 */
  async getMaintenanceEvidence(uuid: string): Promise<ServerHealthData> {
    await this.sample(uuid);
    const evidence = this.evidence.get(uuid);
    if (!evidence) throw new Error("尚无当前健康采样证据");
    return structuredClone(evidence);
  }

  setMaintenance(uuid: string, enabled: boolean): void {
    if (enabled) this.maintenance.add(uuid);
    else this.maintenance.delete(uuid);
    this.snapshots.delete(uuid);
  }

  private newSession(uuid: string, config: ServerConfigPackage, pid: number | null, managed: boolean): Session {
    const serverDir = config.server?.serverDir ?? "";
    const root = getConfigRoot(serverDir, uuid);
    const files = this.app.rptLogReader.listLogs(serverDir, uuid, "rpt").map((file) => file.filePath);
    const session: Session = { pid, processIdentity: null, managed, startedAt: this.now(), configKey: this.configKey(config),
      tail: new HealthRptTail(root, files), heartbeat: null, consecutive: 0 };
    this.sessions.set(uuid, session);
    this.snapshots.delete(uuid);
    return session;
  }

  async sampleAll(): Promise<void> {
    if (this.closed) return;
    const servers = this.app.configStore.listServers();
    await Promise.all(servers.map(({ uuid }) => this.sample(uuid).catch(() => undefined)));
    const active = new Set(servers.map((s) => s.uuid));
    for (const uuid of this.sessions.keys()) if (!active.has(uuid)) this.forget(uuid);
  }

  async get(uuid: string): Promise<ServerHealthData> {
    const snapshot = this.snapshots.get(uuid);
    if (snapshot && this.now() - Date.parse(snapshot.checkedAt) < 10000) return structuredClone(snapshot);
    return this.sample(uuid);
  }

  sample(uuid: string): Promise<ServerHealthData> {
    const running = this.inFlight.get(uuid);
    if (running) return running;
    const work = this.collect(uuid).finally(() => { this.inFlight.delete(uuid); });
    this.inFlight.set(uuid, work);
    return work;
  }

  private async collect(uuid: string): Promise<ServerHealthData> {
    const config = this.app.configStore.load(uuid);
    if (!config) throw new Error("未找到服务器配置");
    const beganAt = this.now();
    const result: ServerHealthData = {
      serverUuid: uuid, state: "unverified", checkedAt: new Date(beganAt).toISOString(), sessionStartedAt: null,
      pid: null, processAlive: null, rconResponsive: null, onlineCount: null, fps: null, heartbeat: null,
      consecutiveHeartbeats: 0, rptPath: null, reasons: [], configurationIssues: healthConfigurationIssues(config),
      thresholds: { ...HEALTH_THRESHOLDS, startupTimeoutSeconds: startupTimeoutSeconds(config) },
      publicReachability: "unverified", playerJoin: "unverified",
    };
    try {
      const process = await this.app.processManager.getState(uuid, config);
      result.processAlive = process.isRunning;
      result.pid = process.pid ?? null;
      if (!process.isRunning || !process.pid) {
        const preparing = this.sessions.get(uuid);
        if (preparing?.managed && preparing.pid === null && this.now() - preparing.startedAt < result.thresholds.startupTimeoutSeconds * 1000) {
          result.state = "starting";
          result.reasons.push("正在创建本次启动进程，尚未确认任务运行");
        } else {
          this.sessions.delete(uuid);
          result.state = "stopped";
          result.reasons.push("服务器进程已停止");
        }
      } else {
        const identity = config.health?.enabled === true ? await this.processIdentity(process.pid) : null;
        if (config.health?.enabled === true && !identity) {
          this.forget(uuid);
          result.reasons.push("无法确认进程启动身份，已丢弃旧心跳；等待身份与新证据");
          return this.publish(result);
        }
        let session = this.sessions.get(uuid);
        if (!session || session.pid !== process.pid || session.configKey !== this.configKey(config) ||
          (session.processIdentity !== null && session.processIdentity !== identity)) {
          session = this.newSession(uuid, config, process.pid, false);
        }
        session.processIdentity = identity;
        result.sessionStartedAt = new Date(session.startedAt).toISOString();
        if (config.health?.enabled === true) {
          const root = getConfigRoot(config.server?.serverDir ?? "", uuid);
          if (!healthModMatches(root)) result.configurationIssues.push("独立健康模组未部署或内容不一致，请应用更改后重启");
          try {
            result.rptPath = this.app.rptLogReader.findActiveRpt(config.server?.serverDir ?? "", uuid);
            const chunk = session.tail.read(result.rptPath);
            if (chunk.reset) { session.heartbeat = null; session.consecutive = 0; }
            for (const line of chunk.lines) {
              const heartbeat = parseHeartbeat(line, this.now());
              if (!heartbeat || Date.parse(heartbeat.emittedAt) < session.startedAt) continue;
              const previous = session.heartbeat;
              const sameMission = previous && previous.epoch === heartbeat.epoch && previous.mission === heartbeat.mission && previous.world === heartbeat.world;
              if (sameMission && (heartbeat.sequence <= previous.sequence || heartbeat.uptimeSeconds <= previous.uptimeSeconds || Date.parse(heartbeat.emittedAt) <= Date.parse(previous.emittedAt))) continue;
              session.consecutive = sameMission && Date.parse(heartbeat.emittedAt) - Date.parse(previous.emittedAt) <= 90000 ? session.consecutive + 1 : 1;
              session.heartbeat = heartbeat;
            }
          } catch {
            session.heartbeat = null;
            session.consecutive = 0;
            result.reasons.push("实例 RPT 读取失败或路径不属于该实例");
          }
          result.onlineCount = await countOnlinePlayers(config);
          result.rconResponsive = result.onlineCount !== null;
          // RCon 等待期间可能停止或启动了另一进程，不能发布旧会话证据。
          const currentProcess = await this.app.processManager.getState(uuid, config);
          const currentIdentity = currentProcess.pid ? await this.processIdentity(currentProcess.pid) : null;
          if (this.sessions.get(uuid) !== session || !currentProcess.isRunning || currentProcess.pid !== session.pid || currentIdentity !== identity) {
            result.state = "unverified";
            result.processAlive = currentProcess.isRunning;
            result.pid = currentProcess.pid ?? null;
            result.onlineCount = null;
            result.rconResponsive = null;
            result.reasons.push("采样期间进程会话发生变化，等待新证据");
            return this.publish(result);
          }
          result.heartbeat = session.heartbeat;
          result.consecutiveHeartbeats = session.consecutive;
          const age = session.heartbeat ? this.now() - Date.parse(session.heartbeat.emittedAt) : Infinity;
          const fresh = age < 90000;
          const timedOut = this.now() - session.startedAt >= result.thresholds.startupTimeoutSeconds * 1000;
          if (fresh) result.fps = session.heartbeat!.fps;
          if (!result.rptPath) result.reasons.push("未发现该实例的 RPT，不能使用共享目录日志代替");
          if (!fresh) result.reasons.push(session.heartbeat ? "超过 90 秒未收到有效任务心跳" : "尚未收到当前会话的有效任务心跳");
          else if (session.consecutive < 2) result.reasons.push("等待连续两条递增任务心跳");
          if (!result.rconResponsive) result.reasons.push("RCon 无响应或未配置，在线人数未知（不是 0 人）");
          if (fresh && session.consecutive >= 2 && result.rconResponsive && !result.configurationIssues.length && !result.reasons.length) {
            result.state = "healthy";
            result.reasons.push("当前进程存活、RCon 有响应且任务心跳持续递增");
          } else if (result.configurationIssues.length || (session.heartbeat && !fresh) || timedOut || (session.consecutive >= 2 && !result.rconResponsive)) {
            result.state = "unhealthy";
          } else result.state = session.managed ? "starting" : "unverified";
        } else {
          result.reasons.push("未启用独立心跳，进程存活不代表任务已运行");
        }
      }
    } catch {
      result.state = "unverified";
      result.reasons.push("进程状态采集失败，不能确认运行健康");
    }
    return this.publish(result);
  }

  private publish(result: ServerHealthData): ServerHealthData {
    result.checkedAt = new Date(this.now()).toISOString();
    this.evidence.set(result.serverUuid, structuredClone(result));
    if (this.maintenance.has(result.serverUuid)) {
      result.state = "maintenance";
      result.reasons.unshift("此实例处于受保护维护流程中");
    }
    result.checkedAt = new Date(this.now()).toISOString();
    const previous = this.snapshots.get(result.serverUuid);
    if (!this.closed) {
      this.snapshots.set(result.serverUuid, structuredClone(result));
      this.emit("sample", structuredClone(result));
      if (previous?.state !== result.state) this.emit("change", structuredClone(result), previous?.state);
    }
    return structuredClone(result);
  }
}
