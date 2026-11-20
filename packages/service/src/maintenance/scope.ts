import * as path from "node:path";
import { physicalDirectory } from "../util/path-identity.js";
import type { MaintenanceImpact, MaintenanceResource, MaintenanceScopeIssue } from "../types/maintenance.js";

export interface MaintenanceTarget { modId: number; path: string }
/** 运行中提供 OS 读取的 argv；已停止提供将使用的 argv。读取失败必须传 null。 */
export interface MaintenanceLoadSnapshot {
  serverUuid: string;
  kind: "server" | "headless";
  workingDirectory: string;
  args: string[] | null;
}

function overlaps(first: string, second: string): boolean {
  const inside = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return !relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
  };
  return inside(first, second) || inside(second, first);
}

/** 只解析已知模组参数，不执行参数文件，也不从参数/事件拼接命令。 */
export function loadedModPaths(snapshot: MaintenanceLoadSnapshot): { paths: string[]; complete: boolean } {
  if (snapshot.args === null || !snapshot.workingDirectory.trim() || !path.isAbsolute(snapshot.workingDirectory)) return { paths: [], complete: false };
  const paths: string[] = []; const counts = new Map<string, number>(); let complete = true;
  for (let index = 0; index < snapshot.args.length; index++) {
    const token = snapshot.args[index].replace(/^"(.*)"$/, "$1");
    if (/^-par(?:=|$)/i.test(token)) complete = false;
    const match = token.match(/^-(mod|serverMod)(?:=(.*))?$/i);
    if (!match) continue;
    const name = match[1].toLowerCase(); counts.set(name, (counts.get(name) ?? 0) + 1);
    if (counts.get(name)! > 1) complete = false;
    let value = match[2];
    if (value === undefined) {
      value = snapshot.args[++index];
      if (value === undefined || value.startsWith("-")) { complete = false; continue; }
    }
    value = value.replace(/^"(.*)"$/, "$1");
    for (const part of value.split(";").map((item) => item.trim()).filter(Boolean)) {
      if (/[\r\n\0"]/.test(part)) { complete = false; continue; }
      paths.push(path.resolve(snapshot.workingDirectory, part));
    }
  }
  return { paths: [...new Set(paths)], complete };
}

/** 先按实际物理目录建图，绝不以相同 Workshop ID 合并独立副本。只读，不停服/创建目录。 */
export function computeMaintenanceImpact(targets: MaintenanceTarget[], snapshots: MaintenanceLoadSnapshot[]): MaintenanceImpact {
  const byKey = new Map<string, MaintenanceResource>(); const issues: MaintenanceScopeIssue[] = [];
  const issue = (code: MaintenanceScopeIssue["code"], serverUuid: string | null, filePath: string | null, reason: string) => issues.push({ code, serverUuid, path: filePath, reason });
  for (const target of targets) {
    if (!Number.isSafeInteger(target.modId) || target.modId <= 0) throw new Error("维护目标必须具有有效 Workshop ID");
    try {
      const physical = physicalDirectory(target.path);
      let resource = byKey.get(physical.key);
      if (!resource) {
        resource = { key: physical.key, physicalPath: physical.path, modIds: [], serverUuids: [], headlessUuids: [], aliases: [] };
        byKey.set(physical.key, resource);
      }
      if (!resource.modIds.includes(target.modId)) resource.modIds.push(target.modId);
      if (!resource.aliases.includes(target.path)) resource.aliases.push(target.path);
    } catch {
      issue("TARGET_UNREADABLE", null, target.path, "待更新物理目录不存在或无法读取，不能准备无备份更新");
    }
  }
  const resources = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (let index = 0; index < resources.length; index++) {
    const resource = resources[index];
    if (resource.modIds.length > 1) issue("RESOURCE_ID_CONFLICT", null, resource.physicalPath, "同一物理目录关联多个 Workshop ID，需人工核对");
    for (const other of resources.slice(index + 1)) if (overlaps(resource.key, other.key)) issue("OVERLAPPING_RESOURCES", null, resource.physicalPath, "受管目录相互嵌套，不能独立备份和回滚");
  }
  const resolved = new Map<string, ReturnType<typeof physicalDirectory> | null>();
  for (const snapshot of snapshots) {
    const loaded = loadedModPaths(snapshot);
    if (!loaded.complete) issue("RUNTIME_UNKNOWN", snapshot.serverUuid, null, "加载参数不可读取或存在参数文件/重复模组参数，影响范围尚未确认");
    for (const loadedPath of loaded.paths) {
      if (!resolved.has(loadedPath)) {
        try { resolved.set(loadedPath, physicalDirectory(loadedPath)); }
        catch { resolved.set(loadedPath, null); }
      }
      const physical = resolved.get(loadedPath);
      if (!physical) {
        issue("LOAD_PATH_UNREADABLE", snapshot.serverUuid, loadedPath, "无法确认加载目录的物理路径，不能忽略潜在共享引用");
        continue;
      }
      for (const resource of resources) {
        if (!overlaps(resource.key, physical.key)) continue;
        const instances = snapshot.kind === "headless" ? resource.headlessUuids : resource.serverUuids;
        if (!instances.includes(snapshot.serverUuid)) instances.push(snapshot.serverUuid);
        if (!resource.aliases.includes(loadedPath)) resource.aliases.push(loadedPath);
      }
    }
  }
  for (const resource of resources) {
    resource.modIds.sort((a, b) => a - b); resource.serverUuids.sort(); resource.headlessUuids.sort(); resource.aliases.sort();
  }
  return { resources, serverUuids: [...new Set(resources.flatMap((resource) => [...resource.serverUuids, ...resource.headlessUuids]))].sort(),
    headlessUuids: [...new Set(resources.flatMap((resource) => resource.headlessUuids))].sort(), issues, complete: targets.length > 0 && resources.length > 0 && !issues.length };
}
