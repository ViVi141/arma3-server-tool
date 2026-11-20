import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { OperationsStore, type OperationNotice } from "../operations/store.js";
import type { MaintenanceCheckpoint, OperationEventInput, OperationEventType } from "../types/operations.js";
import type { MaintenanceDiscovery } from "../types/maintenance.js";
import { MaintenanceSteamError, type MaintenanceSteamSession } from "../steamcmd/manager.js";
import { operationSignal } from "../util/operation-context.js";
import { MaintenanceLocks, maintenanceLocks, type LockScope } from "./locks.js";
import type { BackupReference } from "./backup.js";

export type MaintenanceState = "queued" | "waiting_policy" | "authenticating" | "paused_auth" | "backing_up" | "countdown" | "stopping" | "downloading" | "verifying" | "starting" | "checking_health" | "succeeded" | "cancelled" | "failed" | "rolling_back" | "rolled_back" | "manual_intervention";
export interface MaintenanceProcessReceipt { serverUuid: string; kind: "server" | "headless"; pid: number; session: string; executable: string }
export interface MaintenanceOriginalInstance { serverUuid: string; server: MaintenanceProcessReceipt | null; headless: MaintenanceProcessReceipt | null }
/** 仅保存可恢复所需身份与哈希；完整配置、argv、密码不得进入此对象。 */
export interface MaintenanceExecutionPlan {
  mods: MaintenanceDiscovery[];
  instances: MaintenanceOriginalInstance[];
  scope: LockScope;
  fingerprint: string;
  allowed: boolean;
  requiresCountdown: boolean;
  expectedDurationMinutes: number;
  production?: MaintenanceProductionEvidence;
}
export interface MaintenanceProductionEvidence {
  originUuid: string;
  configurationHash: string;
  runtimeHash: string;
  impactHash: string;
  keyTargets: string[];
  signatures: Array<{
    serverUuid: string; modKey: string; modDirName: string; serverDir: string; client: boolean;
    pboCount: number; signedPboCount: number; missingPbos: string[]; keyCount: number;
  }>;
}
export interface MaintenanceBatchRecovery extends Record<string, unknown> {
  version: 1;
  request: { serverUuid: string; keys: string[]; retryOf: string | null };
  plan: MaintenanceExecutionPlan | null;
  backups: BackupReference[];
  stopStarted: boolean;
  writesStarted: boolean;
  started: MaintenanceProcessReceipt[];
  rollbackPhase: "none" | "stopping" | "files" | "starting" | "health" | "done";
  failureCode: string | null;
}
export interface MaintenanceBatch extends MaintenanceCheckpoint { state: MaintenanceState; recovery: MaintenanceBatchRecovery }
export class MaintenanceFailure extends Error { constructor(readonly code: string) { super(code); } }

/** OS、备份与游戏适配器的安全契约；恢复方法不能依赖已经取消的任务信号。 */
export interface MaintenanceExecutorAdapter {
  plan(uuid: string, keys: string[]): Promise<MaintenanceExecutionPlan>;
  withSteamSession<T>(fn: (session: MaintenanceSteamSession) => Promise<T>): Promise<T>;
  /** 必须重新采样策略、在线状态、会话和范围；变化不得静默扩大本批次。 */
  revalidate(plan: MaintenanceExecutionPlan): Promise<{ allowed: boolean; requiresCountdown: boolean }>;
  prepareBackup(id: string, plan: MaintenanceExecutionPlan, signal: AbortSignal): Promise<BackupReference>;
  verifyBackup(plan: MaintenanceExecutionPlan, backups: BackupReference[]): Promise<void>;
  broadcast(plan: MaintenanceExecutionPlan, remainingSeconds: number): Promise<void>;
  /** 只停止原始或本流程已登记的会话，任何未知进程均拒绝；返回时所有目标必须退出。 */
  stop(plan: MaintenanceExecutionPlan, started: MaintenanceProcessReceipt[]): Promise<void>;
  /** 新公钥首次写入前必须先备份并调用 registerBackup 持久登记。 */
  verifyUpdated(plan: MaintenanceExecutionPlan, registerBackup: (reference: BackupReference) => void): Promise<void>;
  /** 仅恢复 plan.instances 中原先运行的成员；每个新 PID 须登记后才继续后续成员。 */
  startOriginal(plan: MaintenanceExecutionPlan, registerProcess: (receipt: MaintenanceProcessReceipt) => void): Promise<void>;
  waitHealthy(plan: MaintenanceExecutionPlan, started: MaintenanceProcessReceipt[], signal: AbortSignal): Promise<void>;
  restoreFiles(plan: MaintenanceExecutionPlan, backups: BackupReference[]): Promise<void>;
  /** 只删除 keep 之外的已完成备份目录；未解决故障的引用由执行器全部纳入 keep。 */
  pruneBackups(keep: string[]): Promise<string[]>;
  setMaintenance(uuids: string[], enabled: boolean): void;
}

const TERMINAL = new Set<MaintenanceState>(["waiting_policy", "paused_auth", "succeeded", "cancelled", "failed", "rolled_back", "manual_intervention"]);
const RETRYABLE = new Set<MaintenanceState>(["waiting_policy", "paused_auth", "cancelled", "failed", "rolled_back"]);
const SAFE_CODES = new Set(["AUTH_REQUIRED", "AUTH_FAILED", "DOWNLOAD_FAILED", "STEAM_PATH_MISMATCH", "STEAM_NOT_INSTALLED", "POLICY_CHANGED", "SCOPE_CHANGED", "BACKUP_FAILED", "BROADCAST_FAILED", "STOP_FAILED", "VERSION_MISMATCH", "SIGNATURE_DEGRADED", "START_FAILED", "HEALTH_FAILED", "CANCELLED", "INTERRUPTED", "RECOVERY_FAILED"]);
function safeCode(error: unknown, fallback: string): string {
  const code = error instanceof MaintenanceFailure || error instanceof MaintenanceSteamError ? error.code : fallback;
  return SAFE_CODES.has(code) ? code : "RECOVERY_FAILED";
}
function isBatch(value: MaintenanceCheckpoint): value is MaintenanceBatch { return value.recovery.version === 1 && Boolean(value.recovery.request); }
interface Job { batch: MaintenanceBatch; journalFailed: boolean }
type Lease = ReturnType<MaintenanceLocks["acquire"]>;

/** 写前日志 + 有界回滚。生产入口须 await initialize() 后再启动调度或接受写请求。 */
export class MaintenanceExecutor {
  private active = new Map<string, { controller: AbortController; work: Promise<MaintenanceBatch> }>();
  private leases = new Map<string, Lease>();
  private initialized = false;
  private closed = false;
  private initialization: Promise<void> | null = null;
  constructor(private store: OperationsStore, private adapter: MaintenanceExecutorAdapter,
    private locks = maintenanceLocks, private now: () => number = Date.now,
    private sleep: (ms: number, signal: AbortSignal) => Promise<void> = async (ms, signal) => { await delay(ms, undefined, { signal }); }) {}

  private save(job: Job, patch: Partial<MaintenanceBatch> = {}, recovery: Partial<MaintenanceBatchRecovery> = {}): void {
    const next = { ...job.batch, ...patch, updatedAt: new Date(this.now()).toISOString(), recovery: { ...job.batch.recovery, ...recovery } };
    try { this.store.checkpoint(next); job.batch = next; }
    catch (error) { job.journalFailed = true; throw error; }
  }
  private event(job: Job, type: OperationEventType, code: string, completed = false): void {
    try {
      this.store.enqueueNotice({ id: randomUUID(), kind: "record", completed, input: { type, reasonCode: code, severity: type === "update_completed" ? "info" : type === "recovery_failed" ? "critical" : "warning",
        serverUuids: job.batch.serverUuids, modIds: job.batch.modIds, batchId: job.batch.id,
        message: `维护批次状态：${job.batch.state}；原因：${code}`,
        suggestedAction: type === "update_completed" ? "维护完成；公网可达性及真实玩家加入仍需另行验证" : "查看维护检查点和实例证据；需要手机授权时先完成授权，再显式重试。不要绕过维护锁。",
        requiresAttention: type !== "update_completed" && type !== "rollback" } as OperationEventInput });
      this.store.flushNotices();
    }
    catch { /* 意图已随检查点持久化时由下次启动补发；通知失败不得打断恢复或反向回滚已验证版本。 */ }
  }
  /** 只按固定字段解除本批次事件；确认已读与故障恢复仍是两种状态。 */
  private resolveEvents(job: Job, options: { batchIds?: string[]; exceptReasons?: string[]; exceptTypes?: OperationEventType[] } = {}): void {
    try {
      this.store.enqueueNotice({ id: randomUUID(), kind: "resolve", batchIds: options.batchIds ?? [job.batch.id], exceptReasons: options.exceptReasons, exceptTypes: options.exceptTypes });
      this.store.flushNotices();
    } catch { /* 恢复已完成；补发失败由下次启动 flushNotices 处理。 */ }
  }
  private finish(job: Job, state: MaintenanceState, result: string, attention = false): void {
    this.save(job, { state, result, requiresAttention: attention });
  }
  private release(job: Job): void {
    if (job.journalFailed || job.batch.state === "manual_intervention") return;
    const lease = this.leases.get(job.batch.id);
    if (lease) {
      lease.release(); this.leases.delete(job.batch.id);
      this.adapter.setMaintenance(job.batch.serverUuids, false);
    }
  }
  /** 成功批次只保留最近一批可恢复文件；未解决故障与在途批次的全部引用一律保留。 */
  private async cleanupBackups(): Promise<void> {
    const batches = this.store.checkpoints().filter(isBatch);
    const keep = new Set<string>();
    for (const batch of batches) if (batch.state !== "succeeded") for (const reference of batch.recovery.backups) keep.add(reference.batchId);
    // 批次串行执行，检查点按创建顺序返回；最后一条成功批次即最近一批，不受系统时钟回拨或同毫秒并列影响。
    const latest = batches.filter((batch) => batch.state === "succeeded").at(-1);
    if (latest) for (const reference of latest.recovery.backups) keep.add(reference.batchId);
    try { await this.adapter.pruneBackups([...keep]); }
    catch { /* 清理失败保留全部证据，不影响已验证的成功或恢复结果。 */ }
  }
  private async gate(plan: MaintenanceExecutionPlan, signal: AbortSignal): Promise<{ requiresCountdown: boolean }> {
    signal.throwIfAborted();
    const check = await this.adapter.revalidate(plan);
    signal.throwIfAborted();
    if (!check.allowed) throw new MaintenanceFailure("POLICY_CHANGED");
    return check;
  }

  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    if (this.closed) return Promise.reject(new Error("维护执行器已关闭"));
    this.initialization = this.initializeBody();
    return this.initialization;
  }
  private async initializeBody(): Promise<void> {
    // 上次进程中断前已落盘、尚未投递的通知必须先补发；失败不影响恢复流程。
    try { this.store.flushNotices(); } catch { /* 事件补发失败不能阻止批次恢复。 */ }
    const pending = this.store.checkpoints().filter(isBatch).filter((batch) => !TERMINAL.has(batch.state) || batch.state === "manual_intervention");
    // 先重建所有遗留锁，再开始恢复。冲突/坏路径会使初始化失败，不能带病开放写 API。
    for (const batch of pending) if (batch.recovery.plan) {
      this.leases.set(batch.id, this.locks.acquire(batch.recovery.plan.scope));
      this.adapter.setMaintenance(batch.serverUuids, true);
    }
    for (const batch of pending) {
      const job: Job = { batch, journalFailed: false };
      if (batch.state === "manual_intervention") continue;
      if (!batch.recovery.stopStarted) { this.finish(job, "cancelled", "INTERRUPTED"); this.release(job); continue; }
      const lease = this.leases.get(batch.id);
      if (!lease) throw new Error("未完成批次缺少恢复范围，拒绝启动自动维护");
      try {
        await lease.run(() => this.adapter.withSteamSession(async () => { await this.recover(job, "INTERRUPTED", true); }));
      } catch (error) {
        if (job.journalFailed) throw error;
        this.finish(job, "manual_intervention", "RECOVERY_FAILED", true);
        this.event(job, "recovery_failed", "RECOVERY_FAILED");
      } finally { this.release(job); }
    }
    await this.cleanupBackups();
    this.initialized = true;
  }

  private validate(uuid: string, keys: string[], retryOf: string | null): string[] {
    if (!this.initialized || this.closed) throw new Error("维护执行器尚未就绪或已关闭");
    if (!uuid || !Array.isArray(keys) || !keys.length || keys.length > 500 || keys.some((key) => !/^[a-f0-9]{64}$/.test(key)) || new Set(keys).size !== keys.length) throw new Error("必须显式选择有效维护目标");
    const sorted = [...keys].sort();
    if (retryOf) {
      const parent = this.store.maintenance(retryOf);
      if (!parent || !isBatch(parent) || !RETRYABLE.has(parent.state) || parent.recovery.request.serverUuid !== uuid || JSON.stringify(parent.recovery.request.keys) !== JSON.stringify(sorted)) throw new Error("重试必须保留原批次目标，且原批次必须已安全结束");
    }
    return sorted;
  }
  /** 立即返回已持久化的批次，长流程在后台继续；HTTP 入口据此返回 202 并通过检查点查询进度。 */
  submit(uuid: string, keys: string[], requestId: string, retryOf: string | null = null): { batch: MaintenanceBatch; work: Promise<MaintenanceBatch> } {
    const sorted = this.validate(uuid, keys, retryOf);
    const request = { serverUuid: uuid, keys: sorted, retryOf };
    const at = new Date(this.now()).toISOString();
    const initial: MaintenanceBatch = { id: randomUUID(), state: "queued", createdAt: at, updatedAt: at, serverUuids: [], modIds: [], requiresAttention: false, result: null,
      recovery: { version: 1, request, plan: null, backups: [], stopStarted: false, writesStarted: false, started: [], rollbackPhase: "none", failureCode: null } };
    const claim = this.store.claimMaintenanceRequest(requestId, createHash("sha256").update(JSON.stringify(request)).digest("hex"), initial);
    if (!claim.created) return { batch: claim.checkpoint as MaintenanceBatch, work: this.active.get(claim.checkpoint.id)?.work ?? Promise.resolve(claim.checkpoint as MaintenanceBatch) };
    const controller = new AbortController();
    const parentSignal = operationSignal.getStore();
    const abort = () => controller.abort();
    parentSignal?.addEventListener("abort", abort, { once: true });
    if (parentSignal?.aborted) abort();
    const job: Job = { batch: claim.checkpoint as MaintenanceBatch, journalFailed: false };
    // 延后一微任务再工作，确保并发相同 requestId 看到同一在途 Promise。
    const work = Promise.resolve().then(() => operationSignal.run(controller.signal, () => this.run(job, controller.signal)))
      .finally(() => { parentSignal?.removeEventListener("abort", abort); this.active.delete(initial.id); });
    this.active.set(initial.id, { controller, work });
    return { batch: structuredClone(initial), work };
  }
  execute(uuid: string, keys: string[], requestId: string, retryOf: string | null = null): Promise<MaintenanceBatch> {
    // 参数错误以拒绝 Promise 返回；检查点写入失败仍同步抛出，避免掩盖持久化故障。
    try { this.validate(uuid, keys, retryOf); }
    catch (error) { return Promise.reject(error); }
    return this.submit(uuid, keys, requestId, retryOf).work;
  }
  retry(id: string, requestId: string): Promise<MaintenanceBatch> {
    const old = this.store.maintenance(id);
    if (!old || !isBatch(old) || !RETRYABLE.has(old.state)) return Promise.reject(new Error("仅已安全结束或暂停的批次可显式重试；需人工介入的批次仍受锁保护"));
    return this.execute(old.recovery.request.serverUuid, old.recovery.request.keys, requestId, id);
  }
  cancel(id: string): boolean {
    const job = this.active.get(id);
    if (!job) return false;
    job.controller.abort(); return true;
  }
  /**
   * 人工确认现场已处理完毕后显式释放：只适用于需人工介入的批次，保留全部备份与事件历史，
   * 释放实例/目录锁并标记为可重试的已结束批次；绝不能被自动调度或取消信号隐式调用。
   */
  resolveManual(id: string): MaintenanceBatch | null {
    const value = this.store.maintenance(id);
    if (!value || !isBatch(value)) return null;
    if (this.active.has(id)) throw new Error("批次仍在执行，不能人工释放");
    if (value.state !== "manual_intervention") throw new Error("仅需人工介入的批次可确认处理完成；其他状态请使用重试或取消");
    const batch: MaintenanceBatch = { ...value, state: "failed", result: "MANUAL_RELEASED", requiresAttention: false, updatedAt: new Date(this.now()).toISOString() };
    this.store.checkpoint(batch);
    const lease = this.leases.get(id);
    if (lease) {
      lease.release(); this.leases.delete(id);
      this.adapter.setMaintenance(batch.serverUuids, false);
    }
    this.resolveEvents({ batch, journalFailed: false });
    return structuredClone(batch);
  }
  /** 自动调度不得为已失败/待 2FA 的相同物理资源生成新请求绕过暂停。 */
  automaticBlocked(keys: string[]): boolean {
    const batches = this.store.checkpoints().filter(isBatch);
    const byId = new Map(batches.map((batch) => [batch.id, batch]));
    const retried = new Set<string>();
    for (const batch of batches.filter((item) => item.state === "succeeded")) {
      let parent = batch.recovery.request.retryOf;
      while (parent && !retried.has(parent)) { retried.add(parent); parent = byId.get(parent)?.recovery.request.retryOf ?? null; }
    }
    return batches.some((batch) => !retried.has(batch.id) && ["paused_auth", "failed", "rolled_back", "manual_intervention"].includes(batch.state) && batch.recovery.request.keys.some((key) => keys.includes(key)));
  }

  private async run(job: Job, signal: AbortSignal): Promise<MaintenanceBatch> {
    try {
      signal.throwIfAborted();
      const plan = await this.adapter.plan(job.batch.recovery.request.serverUuid, job.batch.recovery.request.keys);
      this.save(job, { serverUuids: plan.instances.map((item) => item.serverUuid), modIds: [...new Set(plan.mods.map((item) => item.modId))] }, { plan });
      if (!plan.allowed) { this.finish(job, "waiting_policy", "POLICY_CHANGED"); return job.batch; }
      const lease = this.locks.acquire(plan.scope); this.leases.set(job.batch.id, lease);
      await lease.run(() => this.adapter.withSteamSession(async (session) => {
        const cancelled = () => { if (!signal.aborted) this.active.get(job.batch.id)?.controller.abort(); };
        session.signal.addEventListener("abort", cancelled, { once: true });
        if (session.signal.aborted) cancelled();
        let budgetTimer: ReturnType<typeof setInterval> | undefined;
        try {
          await this.gate(plan, signal);
          this.save(job, { state: "authenticating" });
          await session.authenticateCached();
          await this.gate(plan, signal);
          this.save(job, { state: "backing_up" });
          const reference = await this.adapter.prepareBackup(job.batch.id, plan, signal);
          this.save(job, {}, { backups: [reference] });
          let gate = await this.gate(plan, signal);
          if (gate.requiresCountdown) {
            this.save(job, { state: "countdown" });
            const notices = [600, 300, 60];
            for (const [index, remaining] of notices.entries()) {
              await this.gate(plan, signal);
              try { await this.adapter.broadcast(plan, remaining); }
              catch { throw new MaintenanceFailure("BROADCAST_FAILED"); }
              // 从广播确认后等待完整间隔；网络延迟或系统时钟跳变不能缩短已承诺的预告。
              for (let wait = (remaining - (notices[index + 1] ?? 0)) * 1000; wait > 0;) {
                const step = Math.min(10000, wait); await this.sleep(step, signal); wait -= step; await this.gate(plan, signal);
              }
            }
            gate = await this.gate(plan, signal);
          } else {
            gate = await this.gate(plan, signal);
            if (gate.requiresCountdown) throw new MaintenanceFailure("POLICY_CHANGED");
          }
          await this.adapter.verifyBackup(plan, job.batch.recovery.backups);
          // 校验大文件可能耗时；磁盘检查之后仍须最后复核策略/玩家/范围。
          const finalGate = await this.gate(plan, signal);
          if (finalGate.requiresCountdown && job.batch.state !== "countdown") throw new MaintenanceFailure("POLICY_CHANGED");
          this.save(job, { state: "stopping" }, { stopStarted: true });
          this.adapter.setMaintenance(job.batch.serverUuids, true);
          const startedAt = this.now();
          let budgetAlerted = false;
          // 定时器覆盖长时间下载；每个阶段结束也复查，避免事件循环繁忙时完全漏报。每批次只告警一次。
          const checkBudget = () => {
            if (budgetAlerted || this.now() - startedAt < plan.expectedDurationMinutes * 60000) return;
            budgetAlerted = true;
            this.event(job, "maintenance_over_budget", "EXPECTED_DURATION_EXCEEDED");
          };
          budgetTimer = setInterval(checkBudget, 10000); budgetTimer.unref();
          await this.adapter.stop(plan, []); checkBudget();
          signal.throwIfAborted();
          this.save(job, { state: "downloading" }, { writesStarted: true });
          await session.downloadOnce(job.batch.modIds); checkBudget();
          signal.throwIfAborted();
          this.save(job, { state: "verifying" });
          await this.adapter.verifyUpdated(plan, (backup) => this.save(job, {}, { backups: [...job.batch.recovery.backups, backup] })); checkBudget();
          signal.throwIfAborted();
          this.save(job, { state: "starting" });
          await this.adapter.startOriginal(plan, (process) => this.save(job, {}, { started: [...job.batch.recovery.started, process] })); checkBudget();
          this.save(job, { state: "checking_health" });
          await this.adapter.waitHealthy(plan, job.batch.recovery.started, signal); checkBudget();
          signal.throwIfAborted();
          this.finish(job, "succeeded", "UPDATE_COMPLETED");
          this.event(job, "update_completed", "UPDATE_COMPLETED", true);
          const recoveredIds = new Set([job.batch.id]);
          let parentId = job.batch.recovery.request.retryOf;
          while (parentId && !recoveredIds.has(parentId)) {
            recoveredIds.add(parentId);
            const parent = this.store.maintenance(parentId);
            parentId = parent && isBatch(parent) ? parent.recovery.request.retryOf : null;
          }
          this.resolveEvents(job, { batchIds: [...recoveredIds], exceptReasons: ["SERVER_ONLY_SIGNATURE_DEGRADED"] });
          // 成功后才清理较旧的已成功备份；失败、回滚与人工介入的现场全部保留。
          await this.cleanupBackups();
        } catch (error) {
          if (job.journalFailed) throw error;
          if (job.batch.state === "succeeded") return; // 完成后的通知故障不得使已验证的新版本回滚。
          const fallback = job.batch.state === "backing_up" ? "BACKUP_FAILED" : job.batch.state === "stopping" ? "STOP_FAILED" : job.batch.state === "starting" ? "START_FAILED" : job.batch.state === "checking_health" ? "HEALTH_FAILED" : "DOWNLOAD_FAILED";
          const code = signal.aborted ? "CANCELLED" : safeCode(error, fallback);
          if (job.batch.recovery.stopStarted) await this.recover(job, code, false);
          else {
            this.finish(job, code === "CANCELLED" ? "cancelled" : code === "AUTH_REQUIRED" ? "paused_auth" : code === "POLICY_CHANGED" || code === "SCOPE_CHANGED" ? "waiting_policy" : "failed", code, code !== "CANCELLED" && code !== "POLICY_CHANGED");
            if (job.batch.requiresAttention) this.event(job, code === "AUTH_REQUIRED" ? "authentication_required" : "download_failed", code);
          }
        } finally { if (budgetTimer) clearInterval(budgetTimer); session.signal.removeEventListener("abort", cancelled); }
      }));
    } catch (error) {
      if (job.journalFailed) throw error;
      if (!TERMINAL.has(job.batch.state)) {
        // 队列取消/获取租约失败发生在停服前；发生过停服而未完成恢复则必须保留锁。
        if (job.batch.recovery.stopStarted) this.finish(job, "manual_intervention", "RECOVERY_FAILED", true);
        else this.finish(job, signal.aborted ? "cancelled" : "failed", signal.aborted ? "CANCELLED" : "SCOPE_CHANGED", !signal.aborted);
      }
    } finally { this.release(job); }
    return structuredClone(job.batch);
  }

  private async recover(job: Job, code: string, interrupted: boolean): Promise<void> {
    const plan = job.batch.recovery.plan;
    // 恢复不继承用户取消，且只允许一个恢复启动尝试。启动阶段中断不盲目再拉起一次。
    await operationSignal.exit(async () => {
      try {
        if (!plan || !job.batch.recovery.backups.length || (interrupted && ["starting", "health", "done"].includes(job.batch.recovery.rollbackPhase))) throw new MaintenanceFailure("RECOVERY_FAILED");
        this.save(job, { state: "rolling_back" }, { failureCode: code, rollbackPhase: "stopping" });
        if (code !== "CANCELLED") this.event(job, code === "AUTH_REQUIRED" ? "authentication_required" : code === "HEALTH_FAILED" ? "health_unhealthy" : code === "SIGNATURE_DEGRADED" ? "signature_degraded" : "download_failed", code);
        await this.adapter.stop(plan, job.batch.recovery.started);
        this.save(job, {}, { rollbackPhase: "files" });
        if (job.batch.recovery.writesStarted) await this.adapter.restoreFiles(plan, job.batch.recovery.backups);
        this.save(job, {}, { rollbackPhase: "starting", started: [] });
        await this.adapter.startOriginal(plan, (process) => this.save(job, {}, { started: [...job.batch.recovery.started, process] }));
        this.save(job, {}, { rollbackPhase: "health" });
        await this.adapter.waitHealthy(plan, job.batch.recovery.started, new AbortController().signal);
        this.save(job, {}, { rollbackPhase: "done" });
        this.finish(job, "rolled_back", code, code === "AUTH_REQUIRED");
        this.event(job, "rollback", code, true);
        this.resolveEvents(job, { exceptTypes: ["authentication_required"] });
      } catch (error) {
        if (job.journalFailed) throw error;
        this.finish(job, "manual_intervention", "RECOVERY_FAILED", true);
        this.event(job, "recovery_failed", "RECOVERY_FAILED");
      }
    });
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const { controller } of this.active.values()) controller.abort();
    await Promise.allSettled([this.initialization, ...[...this.active.values()].map((item) => item.work)]);
    // 未解决故障锁保留至进程退出；不能因关闭执行器而允许另一路启动。
  }
}
