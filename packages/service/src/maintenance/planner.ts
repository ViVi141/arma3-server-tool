import { createHash } from "node:crypto";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";
import type { MaintenanceDiscovery, MaintenancePreview, MaintenanceScopeIssue } from "../types/maintenance.js";
import type { ModMeta } from "../types/mods.js";
import { scanModsForConfig } from "../mods/mod-config-sync.js";
import { countOnlinePlayers } from "../rcon/helpers.js";
import { fetchWorkshopVersions, type SteamWorkshopModInfo } from "../steamcmd/workshop-api.js";
import { physicalDirectory } from "../util/path-identity.js";
import { collectMaintenanceRuntime, impactFromRuntime, type CollectedMaintenanceRuntime } from "./runtime.js";
import { evaluateMaintenancePolicy, findCommonMaintenanceTime, MAINTENANCE_THRESHOLDS, MaintenanceIdleTracker } from "./policy.js";
import { compareWorkshopVersions, readInstalledWorkshopVersion, remoteWorkshopVersion } from "./versions.js";

export class InvalidMaintenanceRequest extends Error {}

interface Candidate { key: string; modId: number; physicalPath: string; sourcePath: string; title: string; configuredUuids: string[] }
interface PlannerDependencies {
  now: () => number;
  scan: (config: ServerConfigPackage) => ModMeta[];
  runtime: () => Promise<CollectedMaintenanceRuntime>;
  online: (config: ServerConfigPackage) => Promise<number | null>;
  remote: (ids: number[]) => Promise<SteamWorkshopModInfo[]>;
}

/** 发现/预览无登录、停服或下载副作用；执行器必须持锁后再次调用同一门禁。 */
export class MaintenancePlanner {
  private deps: PlannerDependencies;
  private idle = new MaintenanceIdleTracker();
  private remoteCache = new Map<number, { checkedAt: number; value: SteamWorkshopModInfo | undefined }>();
  private remotePending: Promise<void> | null = null;
  private samplePending: Promise<CollectedMaintenanceRuntime> | null = null;
  private tickPending: Promise<void> | null = null;
  private checks = new Set<Promise<MaintenanceDiscovery[]>>();
  private previews = new Set<Promise<MaintenancePreview>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextCheck = 0;
  private closed = false;

  constructor(private app: FastifyInstance, dependencies: Partial<PlannerDependencies> = {}) {
    this.deps = { now: Date.now, scan: (config) => scanModsForConfig(app, config, { skipSize: true }),
      runtime: () => collectMaintenanceRuntime(app), online: countOnlinePlayers, remote: fetchWorkshopVersions, ...dependencies };
  }
  private candidates(): { items: Candidate[]; issues: MaintenanceScopeIssue[] } {
    const items = new Map<string, Candidate>(); const issues: MaintenanceScopeIssue[] = [];
    for (const { uuid } of this.app.configStore.listServers()) {
      const config = this.app.configStore.load(uuid); if (!config) continue;
      try {
        for (const mod of this.deps.scan(config)) {
          if (!Number.isSafeInteger(mod.workshopId) || mod.workshopId <= 0 || mod.isLocalMod || !(mod.enabled || mod.isHcMod)) continue;
          try {
            const physical = physicalDirectory(mod.path);
            const key = createHash("sha256").update(JSON.stringify([mod.workshopId, physical.key])).digest("hex");
            const item = items.get(key) ?? { key, modId: mod.workshopId, physicalPath: physical.path, sourcePath: mod.path, title: mod.name, configuredUuids: [] };
            if (!item.configuredUuids.includes(uuid)) item.configuredUuids.push(uuid);
            items.set(key, item);
          } catch { issues.push({ code: "TARGET_UNREADABLE", serverUuid: uuid, path: mod.path, reason: "已启用模组的物理目录不存在或不可读取" }); }
        }
      } catch { issues.push({ code: "LOAD_PATH_UNREADABLE", serverUuid: uuid, path: null, reason: "实例模组扫描失败，不能确认维护范围" }); }
    }
    return { items: [...items.values()], issues };
  }
  private async query(ids: number[]): Promise<void> {
    while (this.remotePending) await this.remotePending;
    if (this.closed) throw new Error("维护预览服务已关闭");
    const now = this.deps.now();
    const missing = [...new Set(ids)].filter((id) => {
      const cached = this.remoteCache.get(id);
      return !cached || cached.checkedAt > now || now - cached.checkedAt >= MAINTENANCE_THRESHOLDS.checkSeconds * 1000;
    });
    if (!missing.length) return;
    const promise = (async () => {
      let found: SteamWorkshopModInfo[] = [];
      try { found = await this.deps.remote(missing); } catch { /* 查询失败也缓存本次未知结果，避免重试风暴。 */ }
      for (const id of missing) this.remoteCache.set(id, { checkedAt: now, value: found.find((item) => item.modId === id) });
    })();
    this.remotePending = promise;
    try { await promise; } finally { if (this.remotePending === promise) this.remotePending = null; }
  }
  checkUpdates(requestedUuid?: string): Promise<MaintenanceDiscovery[]> {
    if (this.closed) return Promise.reject(new Error("维护预览服务已关闭"));
    const promise = this.checkBody(requestedUuid); this.checks.add(promise);
    void promise.finally(() => this.checks.delete(promise)).catch(() => {});
    return promise;
  }
  private async checkBody(requestedUuid?: string): Promise<MaintenanceDiscovery[]> {
    if (requestedUuid && !this.app.configStore.load(requestedUuid)) throw new Error("实例不存在");
    const authorized = new Set(this.app.configStore.listServers().filter(({ uuid }) => uuid === requestedUuid || this.app.configStore.load(uuid)?.maintenance?.enabled).map(({ uuid }) => uuid));
    const candidates = this.candidates().items.filter((item) => item.configuredUuids.some((uuid) => authorized.has(uuid)));
    await this.query(candidates.map((item) => item.modId));
    const values = candidates.map((item): Omit<MaintenanceDiscovery, "pendingSince"> => {
      const cached = this.remoteCache.get(item.modId);
      const localVersion = readInstalledWorkshopVersion(item.sourcePath, item.modId);
      const remoteVersion = remoteWorkshopVersion(cached?.value);
      return { key: item.key, modId: item.modId, physicalPath: item.physicalPath, title: cached?.value?.title || item.title,
        configuredUuids: item.configuredUuids.sort(), localVersion, remoteVersion, status: compareWorkshopVersions(localVersion, remoteVersion),
        checkedAt: new Date(cached?.checkedAt ?? this.deps.now()).toISOString() };
    });
    const saved = values.length ? this.app.operations.saveDiscoveries(values) : [];
    return requestedUuid ? saved.filter((item) => item.configuredUuids.includes(requestedUuid)) : saved;
  }
  list(uuid: string): MaintenanceDiscovery[] {
    const current = new Set(this.candidates().items.filter((item) => item.configuredUuids.includes(uuid)).map((item) => item.key));
    return this.app.operations.discoveries().filter((item) => current.has(item.key));
  }
  sample(): Promise<CollectedMaintenanceRuntime> {
    if (this.closed) return Promise.reject(new Error("维护预览服务已关闭"));
    if (this.samplePending) return this.samplePending;
    const promise = (async () => {
      const runtime = await this.deps.runtime();
      await Promise.all(runtime.instances.map(async (instance) => {
        const config = this.app.configStore.load(instance.serverUuid);
        const onlineCount = config && instance.serverRunning === true ? await this.deps.online(config).catch(() => null) : null;
        this.idle.observe(instance.serverUuid, { running: instance.serverRunning, onlineCount, session: instance.server?.session ?? null }, this.deps.now());
      }));
      return runtime;
    })();
    this.samplePending = promise;
    void promise.finally(() => { if (this.samplePending === promise) this.samplePending = null; }).catch(() => {});
    return promise;
  }
  preview(uuid: string, keys: string[]): Promise<MaintenancePreview> {
    if (this.closed) return Promise.reject(new Error("维护预览服务已关闭"));
    const promise = this.previewBody(uuid, keys); this.previews.add(promise);
    void promise.finally(() => this.previews.delete(promise)).catch(() => {});
    return promise;
  }
  /** 执行器使用同一次在线采样和 OS 快照，避免拼接两个不同会话的授权证据。 */
  async previewWithRuntime(uuid: string, keys: string[]): Promise<{ preview: MaintenancePreview; runtime: CollectedMaintenanceRuntime }> {
    if (this.closed) throw new Error("维护预览服务已关闭");
    let runtime: CollectedMaintenanceRuntime | undefined;
    const promise = this.previewBody(uuid, keys, (value) => { runtime = value; });
    this.previews.add(promise);
    try {
      const preview = await promise;
      if (!runtime) throw new Error("维护范围快照缺失");
      return { preview, runtime };
    } finally { this.previews.delete(promise); }
  }
  private async previewBody(uuid: string, keys: string[], onRuntime?: (runtime: CollectedMaintenanceRuntime) => void): Promise<MaintenancePreview> {
    if (!Array.isArray(keys) || !keys.length || keys.length > 500 || keys.some((key) => typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) || new Set(keys).size !== keys.length) throw new InvalidMaintenanceRequest("必须显式选择 1—500 个有效且不重复的维护目标");
    const discoveries = await this.checkUpdates(uuid);
    const mods = keys.map((key) => discoveries.find((item) => item.key === key));
    if (mods.some((item) => !item)) throw new InvalidMaintenanceRequest("选中项已失效或不属于本实例，请重新检查更新");
    const selected = mods as MaintenanceDiscovery[];
    const runtime = await this.sample(); const now = this.deps.now();
    onRuntime?.(runtime);
    const impact = impactFromRuntime(selected.map((item) => ({ modId: item.modId, path: item.physicalPath })), runtime);
    impact.issues.push(...this.candidates().issues); impact.complete &&= impact.issues.length === 0;
    const reasons = impact.issues.map((issue) => issue.reason);
    for (const item of selected) {
      if (item.status !== "outdated" || !item.remoteVersion || !item.localVersion || !item.pendingSince) reasons.push(`${item.modId}：没有已确认且可备份的待更新版本`);
      if (now - Date.parse(item.checkedAt) >= MAINTENANCE_THRESHOLDS.checkSeconds * 1000 || Date.parse(item.checkedAt) > now) reasons.push(`${item.modId}：远程版本证据已失效`);
      try {
        const destination = path.join(this.app.steamCmd.workshopRoot, "steamapps", "workshop", "content", "107410", String(item.modId));
        if (!this.app.steamCmd.workshopRoot || physicalDirectory(destination).key !== physicalDirectory(item.physicalPath).key) reasons.push(`${item.modId}：此独立副本不是当前 SteamCMD 的物理写入目标`);
      } catch { reasons.push(`${item.modId}：无法确认 SteamCMD 的物理写入目标`); }
    }
    if (!impact.serverUuids.length) reasons.push("没有可确认的受影响实例，不能推定维护授权");
    const pendingSince = Math.min(...selected.map((item) => item.pendingSince ? Date.parse(item.pendingSince) : NaN));
    const instances = impact.serverUuids.filter((id) => !id.startsWith("unmanaged:")).map((serverUuid) => {
      const config = this.app.configStore.load(serverUuid);
      const state = runtime.instances.find((item) => item.serverUuid === serverUuid);
      const presence = this.idle.get(serverUuid);
      const eligibility = evaluateMaintenancePolicy(config?.maintenance, presence, pendingSince, now);
      if (!eligibility.allowed) reasons.push(`${serverUuid}：${eligibility.reason}`);
      if (state?.headlessRunning === null) reasons.push(`${serverUuid}：HC 运行状态未知`);
      if (presence.running && !config?.health?.enabled) reasons.push(`${serverUuid}：尚未启用独立健康心跳，无法确认更新后的任务健康`);
      return { serverUuid, headlessRunning: state?.headlessRunning ?? null, presence, eligibility };
    });
    let commonTime: MaintenancePreview["commonTime"] = null;
    if (instances.length > 1 && Number.isFinite(pendingSince) && pendingSince <= now) {
      const common = findCommonMaintenanceTime(instances.map((item) => this.app.configStore.load(item.serverUuid)?.maintenance), pendingSince, now);
      commonTime = { at: common.at === null ? null : new Date(common.at).toISOString(), searchedThrough: new Date(common.searchedThrough).toISOString() };
      const modIds = [...new Set(selected.map((item) => item.modId))].sort((a, b) => a - b);
      if (common.at === null) this.app.operations.record({ type: "shared_window_conflict", severity: "warning", serverUuids: instances.map((item) => item.serverUuid), modIds,
        batchId: null, reasonCode: "NO_COMMON_MAINTENANCE_TIME", message: "共享模组在未来 14 天内没有共同授权维护机会，旧版本保持不变", suggestedAction: "核对所有受影响实例的授权、时区、维护与活动保护时段", requiresAttention: true });
      else for (const event of this.app.operations.activeEvents()) {
        if (event.type === "shared_window_conflict" && JSON.stringify(event.modIds) === JSON.stringify(modIds) && JSON.stringify(event.serverUuids) === JSON.stringify(instances.map((item) => item.serverUuid).sort())) this.app.operations.resolve(event.eventId);
      }
    }
    return { createdAt: new Date(now).toISOString(), selectedKeys: keys, mods: selected, impact, instances,
      canExecute: impact.complete && reasons.length === 0 && instances.length > 0, reasons: [...new Set(reasons)], commonTime, thresholds: MAINTENANCE_THRESHOLDS,
      warning: "预览不停止或下载。执行前将重新检查范围、在线状态和策略；下载耗时计入停服，维护窗口仅限制开始时刻。" };
  }
  start(): void {
    if (this.timer || this.closed) return;
    const tick = () => {
      if (this.closed || this.tickPending || !this.app.configStore.listServers().some(({ uuid }) => this.app.configStore.load(uuid)?.maintenance?.enabled)) return;
      const promise = (async () => {
        await this.sample();
        if (this.deps.now() >= this.nextCheck) { await this.checkUpdates(); this.nextCheck = this.deps.now() + MAINTENANCE_THRESHOLDS.checkSeconds * 1000; }
      })().catch(() => { this.app.log.error("维护检查失败，保持原运行状态和旧版本"); });
      this.tickPending = promise;
      void promise.finally(() => { this.tickPending = null; });
    };
    this.timer = setInterval(tick, MAINTENANCE_THRESHOLDS.sampleSeconds * 1000); this.timer.unref(); tick();
  }
  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    await Promise.allSettled([this.tickPending, this.samplePending, this.remotePending, ...this.checks, ...this.previews].filter(Boolean));
  }
}
