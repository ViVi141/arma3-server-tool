import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { MaintenanceDiscovery } from "../types/maintenance.js";
import type { MaintenanceBatch, MaintenanceExecutor } from "./executor.js";
import type { MaintenancePlanner } from "./planner.js";

/** 自动调度只复用已确认的远程版本证据；未知、失败或需 2FA 的目标一律不重试。 */
const TERMINAL = new Set(["waiting_policy", "paused_auth", "succeeded", "cancelled", "failed", "rolled_back", "manual_intervention"]);

export class MaintenanceAutoScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: Promise<void> | null = null;
  private closed = false;
  constructor(private app: FastifyInstance, private planner: MaintenancePlanner,
    private executor: MaintenanceExecutor, private intervalMs = 60000) {}

  /** 请求 ID 由实例＋目标物理副本＋目标版本派生：同一证据不会重复开批次，新版本自然换 ID。 */
  private requestId(uuid: string, mods: MaintenanceDiscovery[], generation: number): string {
    const signature = mods.map((mod) => [mod.key, mod.remoteVersion?.timeUpdated ?? 0, mod.remoteVersion?.sizeBytes ?? 0]).sort();
    return `auto-${createHash("sha256").update(JSON.stringify([uuid, signature, generation])).digest("hex").slice(0, 40)}`;
  }
  private active(mods: MaintenanceDiscovery[]): boolean {
    const keys = new Set(mods.map((mod) => mod.key));
    return this.app.operations.checkpoints().some((checkpoint) => {
      const batch = checkpoint as MaintenanceBatch;
      return batch.recovery?.version === 1 && !TERMINAL.has(batch.state) && batch.recovery.request.keys.some((key) => keys.has(key));
    });
  }
  /** 只提交；批次自身会重新采样策略、在线人数与会话，判据不足时停在 waiting_policy 而不停服。 */
  async runOnce(): Promise<void> {
    if (this.closed) return;
    if (!this.app.configStore.listServers().some(({ uuid }) => this.app.configStore.load(uuid)?.maintenance?.enabled)) return;
    let discoveries: MaintenanceDiscovery[];
    try { discoveries = await this.planner.checkUpdates(); }
    catch { this.app.log.error("自动维护检查更新失败，保持旧版本与原运行状态"); return; }
    for (const { uuid } of this.app.configStore.listServers()) {
      if (this.closed) return;
      const policy = this.app.configStore.load(uuid)?.maintenance;
      // 仅检查模板只记录待处理项；未确认窗口、未启用的实例不会被自动停服。
      if (!policy?.enabled || policy.template === "check_only" || !policy.windowConfirmed) continue;
      const candidates = discoveries.filter((mod) => mod.status === "outdated" && mod.remoteVersion && mod.localVersion && mod.pendingSince && mod.configuredUuids.includes(uuid));
      const mods = candidates.filter((mod) => !this.executor.automaticBlocked([mod.key]));
      if (!mods.length || this.active(mods)) continue;
      const requestId = this.requestId(uuid, mods, 0);
      try { this.executor.submit(uuid, mods.map((mod) => mod.key), requestId); }
      catch (error) {
        if (/维护请求 ID/.test((error as Error).message)) continue;
        this.app.log.error({ serverUuid: uuid, error: (error as Error).message }, "自动维护提交被拒绝，保持原运行状态");
      }
    }
  }
  start(): void {
    if (this.timer || this.closed) return;
    const tick = () => {
      if (this.closed || this.pending) return;
      const promise = this.runOnce().catch(() => { this.app.log.error("自动维护调度失败，保持旧版本与原运行状态"); });
      this.pending = promise;
      void promise.finally(() => { this.pending = null; });
    };
    this.timer = setInterval(tick, this.intervalMs); this.timer.unref(); tick();
  }
  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    await this.pending?.catch(() => {});
  }
}
