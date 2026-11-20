import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";
import type { MaintenanceScopeIssue } from "../types/maintenance.js";
import { buildHeadlessClientCommandLine, buildStartCommandLine, getConfigRoot, getServerExecutablePath, splitCommandLine } from "../config/game-config-writer.js";
import { scanModsForConfig } from "../mods/mod-config-sync.js";
import { collectProcessRuntimes, type ProcessRuntime, type RuntimeInventory } from "../process/runtime.js";
import { getHeadlessClientPid } from "../process/headless.js";
import { physicalLockPath } from "./locks.js";
import { computeMaintenanceImpact, type MaintenanceLoadSnapshot, type MaintenanceTarget } from "./scope.js";

export interface InstanceRuntime {
  serverUuid: string;
  server: ProcessRuntime | null;
  headless: ProcessRuntime | null;
  serverRunning: boolean | null;
  headlessRunning: boolean | null;
}
export interface CollectedMaintenanceRuntime {
  snapshots: MaintenanceLoadSnapshot[];
  instances: InstanceRuntime[];
  issues: MaintenanceScopeIssue[];
  unmanagedUuids: string[];
}
export interface RuntimeConfiguration { uuid: string; config: ServerConfigPackage; planned: MaintenanceLoadSnapshot[] }
function argumentValues(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token.toLowerCase() === `-${name.toLowerCase()}`) values.push(args[++i] ?? "");
    else if (token.toLowerCase().startsWith(`-${name.toLowerCase()}=`)) values.push(token.slice(name.length + 2));
  }
  return values;
}
function uniqueArgument(args: string[], name: string): string | null {
  const values = argumentValues(args, name);
  return values.length === 1 && values[0] !== "" ? values[0] : null;
}
function matchingProcess(runtime: ProcessRuntime, uuid: string, config: ServerConfigPackage, headless: boolean): boolean {
  const name = uniqueArgument(runtime.args, "name");
  const profiles = uniqueArgument(runtime.args, "profiles");
  if (name !== (headless ? `${uuid}_hc` : uuid) || !profiles || !config.server?.serverDir) return false;
  if (runtime.args.some((arg) => arg.toLowerCase() === "-client") !== headless) return false;
  const expectedRoot = getConfigRoot(config.server.serverDir, uuid);
  try {
    if (physicalLockPath(runtime.executable) !== physicalLockPath(path.resolve(getServerExecutablePath(config)))) return false;
    if (physicalLockPath(path.resolve(runtime.workingDirectory, profiles)) !== physicalLockPath(headless ? path.join(expectedRoot, "headless") : expectedRoot)) return false;
    return headless || uniqueArgument(runtime.args, "port") === String(config.startup?.port ?? 2302);
  } catch { return false; }
}

/** 只由 OS 完整枚举确认停止；绝不把 getState 的身份未知/权限失败等同于无人。 */
export function mapMaintenanceRuntime(configurations: RuntimeConfiguration[], inventory: RuntimeInventory): CollectedMaintenanceRuntime {
  const result: CollectedMaintenanceRuntime = { snapshots: [], instances: [], issues: [], unmanagedUuids: [] };
  const used = new Set<number>();
  const unknown = !inventory.complete || inventory.unknownPids.length > 0;
  if (unknown) result.issues.push({ code: "RUNTIME_UNKNOWN", serverUuid: null, path: null, reason: "进程枚举或启动参数读取不完整，无法确认服务器/HC 已停止" });
  for (const { uuid, config, planned } of configurations) {
    const state: InstanceRuntime = { serverUuid: uuid, server: null, headless: null, serverRunning: unknown ? null : false, headlessRunning: unknown ? null : false };
    for (const kind of ["server", "headless"] as const) {
      const matches = inventory.processes.filter((proc) => matchingProcess(proc, uuid, config, kind === "headless"));
      const marker = kind === "headless" ? `${uuid}_hc` : uuid;
      const suspicious = inventory.processes.some((proc) => argumentValues(proc.args, "name").includes(marker) && !matches.includes(proc));
      if (matches.length > 1 || suspicious) {
        state[kind === "server" ? "serverRunning" : "headlessRunning"] = null;
        result.issues.push({ code: "RUNTIME_UNKNOWN", serverUuid: uuid, path: null, reason: "发现重复进程或实例标记与可执行文件/profile/端口不一致，禁止自动停止和恢复" });
      } else if (matches.length === 1) {
        const runtime = matches[0]; used.add(runtime.pid); state[kind] = runtime;
        state[kind === "server" ? "serverRunning" : "headlessRunning"] = true;
        result.snapshots.push({ serverUuid: uuid, kind, args: runtime.args, workingDirectory: runtime.workingDirectory });
      }
      // 当前加载范围与下次启动范围同时参与约束，避免恢复时读到未经锁定的另一份目录。
      const desired = planned.find((item) => item.kind === kind);
      if (desired) result.snapshots.push(desired);
    }
    result.instances.push(state);
  }
  for (const proc of inventory.processes) if (!used.has(proc.pid)) {
    const uuid = `unmanaged:${proc.pid}`; result.unmanagedUuids.push(uuid);
    result.snapshots.push({ serverUuid: uuid, kind: "server", workingDirectory: proc.workingDirectory, args: proc.args });
  }
  return result;
}

export async function collectMaintenanceRuntime(app: FastifyInstance): Promise<CollectedMaintenanceRuntime> {
  const configurations: RuntimeConfiguration[] = [];
  const names = ["arma3server", "arma3server_x64", "arma3server.exe", "arma3server_x64.exe"];
  const pids: number[] = [];
  for (const { uuid } of app.configStore.listServers()) {
    const config = app.configStore.load(uuid);
    if (!config) continue;
    names.push(path.basename(getServerExecutablePath(config)));
    for (const pid of [config.tasks?.processById, app.processManager.getPid(uuid), getHeadlessClientPid(uuid)]) if (typeof pid === "number" && pid > 0) pids.push(pid);
    const planned: MaintenanceLoadSnapshot[] = [];
    if (config.server?.serverDir) {
      const workingDirectory = path.resolve(config.server.serverDir);
      try {
        const mods = scanModsForConfig(app, config, { skipSize: true });
        planned.push({ serverUuid: uuid, kind: "server", workingDirectory, args: splitCommandLine(buildStartCommandLine(uuid, config, mods)) });
        if (config.tasks?.enableHeadlessClient ?? config.basic?.enableHeadlessClient) planned.push({ serverUuid: uuid, kind: "headless", workingDirectory, args: splitCommandLine(buildHeadlessClientCommandLine(uuid, config, mods)) });
      } catch { planned.push({ serverUuid: uuid, kind: "server", workingDirectory, args: null }); }
    }
    configurations.push({ uuid, config, planned });
  }
  return mapMaintenanceRuntime(configurations, await collectProcessRuntimes(names, pids));
}

export function impactFromRuntime(targets: MaintenanceTarget[], runtime: CollectedMaintenanceRuntime) {
  const impact = computeMaintenanceImpact(targets, runtime.snapshots);
  impact.issues.push(...runtime.issues);
  if (impact.serverUuids.some((uuid) => runtime.unmanagedUuids.includes(uuid))) impact.issues.push({ code: "RUNTIME_UNKNOWN", serverUuid: null, path: null, reason: "有工具未接管的进程正在加载本批次目录，不能自动停服" });
  impact.complete = impact.complete && impact.issues.length === 0;
  return impact;
}
