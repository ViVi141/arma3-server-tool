import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";
import type { ServerHealthData } from "../types/health.js";
import type { MaintenanceDiscovery, MaintenanceImpact } from "../types/maintenance.js";
import { buildHeadlessClientCommandLine, buildStartCommandLine, getConfigRoot, getServerExecutablePath, splitCommandLine } from "../config/game-config-writer.js";
import { scanModsForConfig } from "../mods/mod-config-sync.js";
import { findModBikeys, getCopiedBikeyPath, getServerKeysDirectory, inspectMod } from "../mods/bikey-service.js";
import { forgetHeadlessClient, getHeadlessClientPid, startHeadlessClient } from "../process/headless.js";
import { getProcessSessionIdentity, stopProcessSession } from "../process/identity.js";
import type { ProcessRuntime } from "../process/runtime.js";
import type { MaintenanceSteamSession } from "../steamcmd/manager.js";
import { startupTimeoutSeconds } from "../health/configuration.js";
import { RconClient } from "../rcon/client.js";
import { resolveRconOptions } from "../rcon/helpers.js";
import { operationSignal } from "../util/operation-context.js";
import { MaintenanceBackups, verifyManagedDirectory, type BackupReference, type BackupTarget } from "./backup.js";
import { MaintenanceFailure, type MaintenanceExecutionPlan, type MaintenanceExecutorAdapter, type MaintenanceOriginalInstance, type MaintenanceProcessReceipt, type MaintenanceProductionEvidence } from "./executor.js";
import { maintenanceLocks, physicalLockPath, type LockScope } from "./locks.js";
import { collectMaintenanceRuntime, type CollectedMaintenanceRuntime } from "./runtime.js";
import { loadedModPaths, type MaintenanceLoadSnapshot } from "./scope.js";
import { compareWorkshopVersions, readInstalledWorkshopVersion } from "./versions.js";
import { captureWorkshopRecords, probeWorkshopRecords, restoreWorkshopRecords, verifyWorkshopRecordsUnchanged } from "./version-records.js";

interface AdapterDependencies {
  runtime(): Promise<CollectedMaintenanceRuntime>;
  stop(receipt: MaintenanceProcessReceipt): Promise<void>;
  start(uuid: string, kind: "server" | "headless", config: ServerConfigPackage): Promise<number>;
  identity(pid: number): Promise<string | null>;
  health(uuid: string): Promise<ServerHealthData>;
  broadcast(config: ServerConfigPackage, seconds: number): Promise<void>;
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  return value;
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
function fail(code = "SCOPE_CHANGED"): never { throw new MaintenanceFailure(code); }
function proof(plan: MaintenanceExecutionPlan): MaintenanceProductionEvidence { return plan.production ?? fail(); }
function receipt(uuid: string, kind: "server" | "headless", process: ProcessRuntime | null): MaintenanceProcessReceipt | null {
  return process ? { serverUuid: uuid, kind, pid: process.pid, session: process.session, executable: process.executable } : null;
}
function sameReceipt(a: MaintenanceProcessReceipt, b: MaintenanceProcessReceipt): boolean {
  return a.serverUuid === b.serverUuid && a.kind === b.kind && a.pid === b.pid && a.session === b.session && physicalLockPath(a.executable) === physicalLockPath(b.executable);
}
function overlaps(a: string, b: string): boolean {
  const inside = (parent: string, child: string) => { const relative = path.relative(parent, child); return !relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)); };
  return inside(a, b) || inside(b, a);
}
function versionIdentity(mods: MaintenanceDiscovery[]) {
  return mods.map(({ key, physicalPath, localVersion, remoteVersion }) => ({ key, physicalPath, localVersion, remoteVersion })).sort((a, b) => a.key.localeCompare(b.key));
}
function impactIdentity(impact: MaintenanceImpact): string { return hash([impact.resources, impact.serverUuids, impact.headlessUuids]); }
function runtimeIdentity(runtime: CollectedMaintenanceRuntime, uuids: string[]): string {
  return hash(runtime.instances.filter((item) => uuids.includes(item.serverUuid)).sort((a, b) => a.serverUuid.localeCompare(b.serverUuid)));
}
async function fileEvidence(file: string): Promise<unknown> {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 8 * 1024 * 1024) return fail();
    return [physicalLockPath(file), createHash("sha256").update(await fs.readFile(file)).digest("hex")];
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return [physicalLockPath(file), null]; throw error; }
}

/** 将可靠状态机接到现有配置、SteamCMD、文件、公钥、OS 会话与独立健康证据。 */
export class ServiceMaintenanceAdapter implements MaintenanceExecutorAdapter {
  private backups: MaintenanceBackups;
  private deps: AdapterDependencies;
  private restoredHeadless = new Set<number>();
  /** Service 关闭后服务器仍存活；不能在恢复完成后又由通用清理杀掉对应 HC。 */
  restoredHeadlessPids(): number[] { return [...this.restoredHeadless]; }
  constructor(private app: FastifyInstance, dependencies: Partial<AdapterDependencies> = {}) {
    this.backups = new MaintenanceBackups(app.dataDir);
    this.deps = {
      runtime: () => collectMaintenanceRuntime(app), stop: (item) => stopProcessSession(item.pid, item.session, item.executable),
      start: (uuid, kind, config) => this.spawnOriginal(uuid, kind, config), identity: getProcessSessionIdentity,
      health: (uuid) => app.serverHealth.getMaintenanceEvidence(uuid), now: () => performance.now(),
      sleep: async (ms, signal) => { await delay(ms, undefined, { signal }); },
      broadcast: async (config, seconds) => {
        const options = resolveRconOptions(config); if (!options) return fail("BROADCAST_FAILED");
        const client = new RconClient({ ...options, timeout: 5000 });
        try {
          await client.connect();
          const result = await client.sendCommand(`say -1 [A3ST] 服务器将在 ${Math.ceil(seconds / 60)} 分钟后维护更新，届时会断开连接。`);
          if (!result.success) fail("BROADCAST_FAILED");
        } finally { client.disconnect(); }
      }, ...dependencies,
    };
  }
  withSteamSession<T>(fn: (session: MaintenanceSteamSession) => Promise<T>): Promise<T> {
    return this.app.steamCmd.withMaintenanceSession(fn);
  }
  private config(uuid: string): ServerConfigPackage { return this.app.configStore.load(uuid, { forceDisk: true }) ?? fail(); }
  private launch(uuid: string) {
    const config = this.config(uuid), serverDir = config.server?.serverDir;
    if (!serverDir || !path.isAbsolute(serverDir)) return fail();
    const mods = scanModsForConfig(this.app, config, { skipSize: true });
    return { config, serverDir, executable: getServerExecutablePath(config),
      server: buildStartCommandLine(uuid, config, mods), headless: buildHeadlessClientCommandLine(uuid, config, mods) };
  }
  private async configurationHash(uuids: string[]): Promise<string> {
    const values: unknown[] = [];
    for (const uuid of [...uuids].sort()) {
      const launch = this.launch(uuid), config = structuredClone(launch.config);
      if (config.tasks) { delete config.tasks.processById; if (!Object.keys(config.tasks).length) delete config.tasks; }
      const root = getConfigRoot(launch.serverDir, uuid);
      // 游戏退出会自行写入 Arma3Profile；它不是本流程修改的启动配置或回滚对象。
      const files = ["server.cfg", "basic.cfg", "BattlEye/beserver.cfg", "BattlEye/beserver_x64.cfg"];
      values.push([uuid, config, physicalLockPath(launch.serverDir), physicalLockPath(launch.executable), launch.server, launch.headless,
        await Promise.all(files.map((file) => fileEvidence(path.join(root, file))))]);
    }
    // 配置和含密码 argv 只参与哈希，永不进入检查点、任务结果或事件。
    return hash(values);
  }
  private destination(mod: MaintenanceDiscovery): string {
    const root = this.app.steamCmd.workshopRoot;
    if (!root) return fail();
    const target = path.join(root, "steamapps", "workshop", "content", "107410", String(mod.modId));
    if (physicalLockPath(target) !== physicalLockPath(mod.physicalPath)) return fail();
    return target;
  }
  private aliases(runtime: CollectedMaintenanceRuntime, uuid: string, mod: MaintenanceDiscovery): Array<{ name: string; client: boolean }> {
    const result = new Map<string, { name: string; client: boolean }>();
    for (const snapshot of runtime.snapshots.filter((item) => item.serverUuid === uuid)) {
      const loaded = loadedModPaths(snapshot); if (!loaded.complete) return fail();
      const clientSnapshot: MaintenanceLoadSnapshot = { ...snapshot, args: snapshot.args?.map((arg) => arg.replace(/^-serverMod(?==|$)/i, "-ignoredMod")) ?? null };
      const clients = snapshot.kind === "server" ? loadedModPaths(clientSnapshot).paths.map(physicalLockPath) : [];
      for (const alias of loaded.paths) if (physicalLockPath(alias) === physicalLockPath(mod.physicalPath)) {
        const name = path.basename(alias), previous = result.get(name);
        result.set(name, { name, client: !!previous?.client || clients.includes(physicalLockPath(alias)) });
      }
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  async plan(uuid: string, keys: string[]): Promise<MaintenanceExecutionPlan> {
    const { preview, runtime } = await this.app.maintenancePlanner.previewWithRuntime(uuid, keys);
    const uuids = preview.impact.serverUuids;
    const instances: MaintenanceOriginalInstance[] = uuids.map((id) => {
      const state = runtime.instances.find((item) => item.serverUuid === id);
      return { serverUuid: id, server: receipt(id, "server", state?.server ?? null), headless: receipt(id, "headless", state?.headless ?? null) };
    });
    const scope: LockScope = { instances: uuids, paths: preview.mods.map((mod) => ({ path: mod.physicalPath, mode: "write" })) };
    const plan: MaintenanceExecutionPlan = { mods: preview.mods, instances, scope, fingerprint: hash(versionIdentity(preview.mods)), allowed: preview.canExecute,
      requiresCountdown: preview.instances.some((item) => item.eligibility.requiresCountdown), expectedDurationMinutes: Math.min(...uuids.map((id) => this.config(id).maintenance?.expectedDurationMinutes ?? 60)) };
    if (!plan.allowed) return plan;
    const signatures: MaintenanceProductionEvidence["signatures"] = [];
    for (const instance of instances) {
      const launch = this.launch(instance.serverUuid);
      const state = runtime.instances.find((item) => item.serverUuid === instance.serverUuid)!;
      for (const kind of ["server", "headless"] as const) if (state[kind]) {
        // 不把未应用的启动参数偷偷应用到原运行进程，也不持久保存旧 argv 中的密码。
        if (hash(state[kind]!.args) !== hash(splitCommandLine(launch[kind])) || physicalLockPath(state[kind]!.workingDirectory) !== physicalLockPath(launch.serverDir)) fail();
      }
      if (instance.server) {
        const root = getConfigRoot(launch.serverDir, instance.serverUuid);
        await fs.access(path.join(root, "server.cfg")); await fs.access(path.join(root, "basic.cfg"));
      }
      scope.paths!.push({ path: physicalLockPath(getServerKeysDirectory(launch.serverDir)), mode: "write" },
        { path: physicalLockPath(getConfigRoot(launch.serverDir, instance.serverUuid)), mode: "read" }, { path: physicalLockPath(launch.executable), mode: "read" });
      for (const mod of plan.mods) for (const alias of this.aliases(runtime, instance.serverUuid, mod)) {
        const inspected = inspectMod(mod.physicalPath, alias.name, launch.serverDir).evidence;
        if (!inspected || inspected.readErrors.length || !inspected.pboCount) fail("SIGNATURE_DEGRADED");
        signatures.push({ serverUuid: instance.serverUuid, modKey: mod.key, modDirName: alias.name, serverDir: launch.serverDir, client: alias.client,
          pboCount: inspected.pboCount, signedPboCount: inspected.signedPboCount, missingPbos: inspected.missingPbos, keyCount: inspected.keyCount });
      }
    }
    for (const mod of plan.mods) {
      this.destination(mod);
      if (!mod.localVersion || !mod.remoteVersion || !signatures.some((item) => item.modKey === mod.key)) fail();
      scope.paths!.push({ path: physicalLockPath(mod.localVersion!.acfPath), mode: "write" });
    }
    const production: MaintenanceProductionEvidence = { originUuid: uuid, signatures, keyTargets: [], configurationHash: await this.configurationHash(uuids),
      runtimeHash: runtimeIdentity(runtime, uuids), impactHash: impactIdentity(preview.impact) };
    plan.production = production;
    scope.paths = scope.paths!.map((item) => ({ ...item, path: physicalLockPath(item.path) }));
    production.keyTargets = [...(await this.keyWrites(plan)).keys()].sort();
    plan.fingerprint = hash([versionIdentity(plan.mods), instances, scope, production]);
    return plan;
  }
  async revalidate(plan: MaintenanceExecutionPlan) {
    const saved = proof(plan);
    const { preview, runtime } = await this.app.maintenancePlanner.previewWithRuntime(saved.originUuid, plan.mods.map((item) => item.key));
    if (impactIdentity(preview.impact) !== saved.impactHash || hash(versionIdentity(preview.mods)) !== hash(versionIdentity(plan.mods)) ||
      runtimeIdentity(runtime, plan.instances.map((item) => item.serverUuid)) !== saved.runtimeHash || await this.configurationHash(plan.instances.map((item) => item.serverUuid)) !== saved.configurationHash) fail();
    for (const mod of plan.mods) this.destination(mod);
    this.assertPaths(plan);
    return { allowed: preview.canExecute, requiresCountdown: preview.instances.some((item) => item.eligibility.requiresCountdown) };
  }
  private assertPaths(plan: MaintenanceExecutionPlan): void {
    if (plan.scope.paths?.some((item) => physicalLockPath(item.path) !== item.path)) fail();
    for (const baseline of proof(plan).signatures) {
      const keys = physicalLockPath(getServerKeysDirectory(baseline.serverDir));
      if (!plan.scope.paths?.some((item) => item.mode === "write" && item.path === keys)) fail();
    }
    maintenanceLocks.assertAvailable(plan.scope);
  }
  /** 先检查词法叶子，再解析父目录；不能先 realpath 丢失链接证据。 */
  private async keyTarget(plan: MaintenanceExecutionPlan, file: string): Promise<string> {
    this.assertPaths(plan);
    const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
    if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) fail("SIGNATURE_DEGRADED");
    const parent = physicalLockPath(path.dirname(file));
    if (!proof(plan).signatures.some((item) => parent === physicalLockPath(getServerKeysDirectory(item.serverDir))) ||
      !plan.scope.paths?.some((item) => item.mode === "write" && item.path === parent)) fail();
    const resolved = physicalLockPath(file);
    if (path.dirname(resolved) !== parent) fail();
    return resolved;
  }
  async prepareBackup(id: string, plan: MaintenanceExecutionPlan, signal: AbortSignal): Promise<BackupReference> {
    this.assertPaths(plan);
    for (const file of proof(plan).keyTargets) await this.keyTarget(plan, file);
    const records = await captureWorkshopRecords(plan.mods.map((item) => ({ modId: item.modId, acfPath: item.localVersion?.acfPath ?? fail() })));
    await probeWorkshopRecords(records);
    const targets: BackupTarget[] = [...plan.mods.map((item): BackupTarget => ({ path: item.physicalPath, kind: "directory", role: "mod" })),
      ...proof(plan).keyTargets.map((file): BackupTarget => ({ path: file, kind: "file", role: "key" }))];
    const reference = await this.backups.prepare(id, targets, { signal, downloadBytes: Object.fromEntries(plan.mods.map((item) => [item.physicalPath, item.remoteVersion?.sizeBytes ?? fail()])) });
    await verifyWorkshopRecordsUnchanged(records);
    return { ...reference, workshopRecords: records };
  }
  async verifyBackup(_plan: MaintenanceExecutionPlan, backups: BackupReference[]): Promise<void> {
    for (const reference of backups) {
      await this.backups.verifySourcesUnchanged(reference);
      await verifyWorkshopRecordsUnchanged(reference.workshopRecords ?? []);
    }
  }
  async broadcast(plan: MaintenanceExecutionPlan, seconds: number): Promise<void> {
    for (const item of plan.instances) if (item.server) await this.deps.broadcast(this.config(item.serverUuid), seconds);
  }
  private actual(runtime: CollectedMaintenanceRuntime): MaintenanceLoadSnapshot[] {
    return [...runtime.instances.flatMap((item) => (["server", "headless"] as const).flatMap((kind) => item[kind] ? [{ serverUuid: item.serverUuid, kind, args: item[kind]!.args, workingDirectory: item[kind]!.workingDirectory }] : [])),
      ...runtime.snapshots.filter((item) => runtime.unmanagedUuids.includes(item.serverUuid))];
  }
  private assertRuntime(plan: MaintenanceExecutionPlan, runtime: CollectedMaintenanceRuntime, allowed: MaintenanceProcessReceipt[]): MaintenanceProcessReceipt[] {
    if (runtime.issues.length || runtime.instances.some((item) => item.serverRunning === null || item.headlessRunning === null || item.serverRunning !== !!item.server || item.headlessRunning !== !!item.headless)) return fail("STOP_FAILED");
    const uuids = plan.instances.map((item) => item.serverUuid);
    for (const snapshot of this.actual(runtime).filter((item) => !uuids.includes(item.serverUuid))) {
      const loaded = loadedModPaths(snapshot);
      if (!loaded.complete || loaded.paths.some((file) => plan.mods.some((mod) => overlaps(physicalLockPath(file), physicalLockPath(mod.physicalPath))))) fail("STOP_FAILED");
    }
    const running: MaintenanceProcessReceipt[] = [];
    for (const instance of plan.instances) {
      const current = runtime.instances.find((item) => item.serverUuid === instance.serverUuid); if (!current) return fail("STOP_FAILED");
      for (const kind of ["headless", "server"] as const) {
        const value = receipt(instance.serverUuid, kind, current[kind]);
        if (value) { if (!allowed.some((item) => sameReceipt(item, value))) fail("STOP_FAILED"); running.push(value); }
      }
    }
    return running;
  }
  async stop(plan: MaintenanceExecutionPlan, started: MaintenanceProcessReceipt[]): Promise<void> {
    this.assertPaths(plan);
    const allowed = [...plan.instances.flatMap((item) => [item.server, item.headless].filter((p): p is MaintenanceProcessReceipt => p !== null)), ...started];
    const running = this.assertRuntime(plan, await this.deps.runtime(), allowed);
    for (const value of running) await this.deps.stop(value);
    if (this.assertRuntime(plan, await this.deps.runtime(), []).length) fail("STOP_FAILED");
    for (const item of plan.instances) {
      this.app.processManager.forget(item.serverUuid); forgetHeadlessClient(item.serverUuid);
      this.app.configStore.patchSection(item.serverUuid, "tasks", { processById: 0 });
      this.app.serverHealth.forget(item.serverUuid);
    }
  }
  private async keyWrites(plan: MaintenanceExecutionPlan): Promise<Map<string, Buffer>> {
    const writes = new Map<string, Buffer>();
    for (const baseline of proof(plan).signatures) {
      const mod = plan.mods.find((item) => item.key === baseline.modKey) ?? fail();
      for (const key of findModBikeys(mod.physicalPath)) {
        const destination = await this.keyTarget(plan, getCopiedBikeyPath(getServerKeysDirectory(baseline.serverDir), baseline.modDirName, key));
        const content = await fs.readFile(key.fullPath), previous = writes.get(destination);
        if (!content.length || previous && !previous.equals(content)) fail("SIGNATURE_DEGRADED");
        writes.set(destination, content);
      }
    }
    return writes;
  }
  async verifyUpdated(plan: MaintenanceExecutionPlan, registerBackup: (reference: BackupReference) => void): Promise<void> {
    this.assertPaths(plan);
    this.assertRuntime(plan, await this.deps.runtime(), []);
    for (const mod of plan.mods) {
      const installed = readInstalledWorkshopVersion(this.destination(mod), mod.modId);
      if (!installed || compareWorkshopVersions(installed, mod.remoteVersion) !== "up_to_date" || physicalLockPath(installed.acfPath) !== physicalLockPath(mod.localVersion?.acfPath ?? fail())) fail("VERSION_MISMATCH");
      await verifyManagedDirectory(mod.physicalPath, operationSignal.getStore());
    }
    const writes = await this.keyWrites(plan);
    const newTargets = [...writes.keys()].filter((file) => !proof(plan).keyTargets.includes(file));
    if (newTargets.length) {
      const reference = await this.backups.prepare(randomUUID(), newTargets.map((file) => ({ path: file, kind: "file", role: "key" })), { signal: operationSignal.getStore() });
      registerBackup(reference); // 检查点写失败时，下面任何公钥都不得写入。
      await this.backups.verifySourcesUnchanged(reference);
    }
    for (const [file, content] of writes) {
      operationSignal.getStore()?.throwIfAborted();
      if (await this.keyTarget(plan, file) !== file) fail();
      await fs.mkdir(path.dirname(file), { recursive: true });
      const stat = await fs.lstat(file).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
      if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)) fail("SIGNATURE_DEGRADED");
      const temporary = path.join(path.dirname(file), `.a3st-key-${randomUUID()}.tmp`);
      const handle = await fs.open(temporary, "wx", stat ? stat.mode & 0o777 : 0o644);
      try {
        try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
        if (await this.keyTarget(plan, file) !== file) fail();
        await fs.rename(temporary, file);
      } finally { await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); }
    }
    for (const baseline of proof(plan).signatures) {
      const mod = plan.mods.find((item) => item.key === baseline.modKey)!;
      const after = inspectMod(mod.physicalPath, baseline.modDirName, baseline.serverDir).evidence;
      if (!after || after.readErrors.length || !after.pboCount || after.missingKeys.length || after.mismatchedKeys.length) fail("SIGNATURE_DEGRADED");
      const degraded = (baseline.keyCount > 0 && after.keyCount === 0) || after.missingPbos.some((file) => !baseline.missingPbos.includes(file)) || (baseline.signedPboCount > 0 && after.signedPboCount === 0);
      if (degraded && baseline.client) fail("SIGNATURE_DEGRADED");
      try {
        if (degraded) this.app.operations.record({ type: "signature_degraded", severity: "warning", serverUuids: [baseline.serverUuid], modIds: [mod.modId],
          batchId: this.app.operations.checkpoints().find((item) => (item.recovery.plan as MaintenanceExecutionPlan | undefined)?.fingerprint === plan.fingerprint)?.id ?? null,
          reasonCode: "SERVER_ONLY_SIGNATURE_DEGRADED", message: "服务端或 HC 模组签名文件覆盖退化；这不等同于客户端入服阻断", suggestedAction: "检查模组来源与文件证据；文件检查不进行密码学验证", requiresAttention: true });
        else if (!after.missingPbos.length && after.keyCount > 0) for (const event of this.app.operations.activeEvents()) {
          if (event.reasonCode === "SERVER_ONLY_SIGNATURE_DEGRADED" && event.serverUuids.includes(baseline.serverUuid) && event.modIds.includes(mod.modId)) this.app.operations.resolve(event.eventId);
        }
      } catch { /* 告警故障不能使已验证文件反向回滚。 */ }
    }
  }
  async restoreFiles(plan: MaintenanceExecutionPlan, backups: BackupReference[]): Promise<void> {
    this.assertPaths(plan); this.assertRuntime(plan, await this.deps.runtime(), []);
    // 先校验全部备份，再恢复新增公钥，最后恢复原模组与旧公钥。ACF 只恢复本批次条目。
    for (const item of backups) await this.backups.verify(item);
    for (const item of [...backups].reverse()) await this.backups.restore(item);
    await restoreWorkshopRecords(backups.flatMap((item) => item.workshopRecords ?? []));
  }
  async pruneBackups(keep: string[]): Promise<string[]> {
    return this.backups.prune(keep);
  }
  private async spawnOriginal(uuid: string, kind: "server" | "headless", config: ServerConfigPackage): Promise<number> {
    if (kind === "headless") {
      const result = startHeadlessClient(this.app, uuid, { ...config, tasks: { ...config.tasks, enableHeadlessClient: true } }, { replace: false });
      if (!result.success) return fail("START_FAILED");
      return getHeadlessClientPid(uuid) ?? fail("START_FAILED");
    }
    const launch = this.launch(uuid);
    this.app.serverHealth.prepareStart(uuid, config);
    this.app.processManager.register(uuid, { executable: launch.executable, cwd: launch.serverDir, commandLine: launch.server, windowsHide: config.startup?.showServerWindow === false });
    const pid = await this.app.processManager.start(uuid, { replace: false });
    if (!pid) return fail("START_FAILED");
    this.app.serverHealth.bindProcess(uuid, pid);
    return pid;
  }
  async startOriginal(plan: MaintenanceExecutionPlan, registerProcess: (receipt: MaintenanceProcessReceipt) => void): Promise<void> {
    this.assertPaths(plan);
    const uuids = plan.instances.map((item) => item.serverUuid);
    if (await this.configurationHash(uuids) !== proof(plan).configurationHash) fail();
    this.assertRuntime(plan, await this.deps.runtime(), []);
    const registered: MaintenanceProcessReceipt[] = [];
    for (const instance of plan.instances) for (const kind of ["server", "headless"] as const) if (instance[kind]) {
      operationSignal.getStore()?.throwIfAborted();
      this.assertRuntime(plan, await this.deps.runtime(), registered);
      const pid = await this.deps.start(instance.serverUuid, kind, this.config(instance.serverUuid));
      if (kind === "headless") this.restoredHeadless.add(pid);
      const session = await this.deps.identity(pid); if (!session) return fail("START_FAILED");
      const value = { serverUuid: instance.serverUuid, kind, pid, session, executable: instance[kind]!.executable };
      registerProcess(value); registered.push(value);
      if (kind === "server") this.app.configStore.patchSection(instance.serverUuid, "tasks", { processById: pid });
    }
  }
  async waitHealthy(plan: MaintenanceExecutionPlan, started: MaintenanceProcessReceipt[], signal: AbortSignal): Promise<void> {
    const expected = plan.instances.flatMap((item) => (["server", "headless"] as const).filter((kind) => item[kind]).map((kind) => `${item.serverUuid}:${kind}`)).sort();
    if (JSON.stringify(started.map((item) => `${item.serverUuid}:${item.kind}`).sort()) !== JSON.stringify(expected)) fail("HEALTH_FAILED");
    const timeout = Math.max(120, ...plan.instances.filter((item) => item.server).map((item) => startupTimeoutSeconds(this.config(item.serverUuid)))) * 1000;
    const began = this.deps.now(); let samples = 0;
    do {
      signal.throwIfAborted();
      const running = this.assertRuntime(plan, await this.deps.runtime(), started);
      if (running.length !== started.length) fail("HEALTH_FAILED");
      const health = await Promise.all(plan.instances.filter((item) => item.server).map(async (item) => ({ uuid: item.serverUuid, value: await this.deps.health(item.serverUuid) })));
      const healthy = health.every(({ uuid, value }) => value.state === "healthy" && value.pid === started.find((p) => p.kind === "server" && p.serverUuid === uuid)?.pid && value.processAlive && value.rconResponsive && value.consecutiveHeartbeats >= 2 && value.heartbeat !== null);
      if (health.some(({ value }) => value.state === "unhealthy" || value.state === "stopped")) fail("HEALTH_FAILED");
      if (this.assertRuntime(plan, await this.deps.runtime(), started).length !== started.length) fail("HEALTH_FAILED");
      samples = healthy ? samples + 1 : 0;
      if (healthy && (samples >= 2 || started.length === 0)) return;
      if (this.deps.now() - began >= timeout) break;
      await this.deps.sleep(10000, signal);
    } while (this.deps.now() - began <= timeout);
    fail("HEALTH_FAILED");
  }
  setMaintenance(uuids: string[], enabled: boolean): void { for (const uuid of uuids) this.app.serverHealth.setMaintenance(uuid, enabled); }
}
