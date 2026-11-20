import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parseWorkshopKeyValues, stringifyWorkshopKeyValues, workshopSection, type WorkshopKeyValues } from "../steamcmd/workshop-acf.js";
import { physicalLockPath } from "./locks.js";

const SECTIONS = ["WorkshopItemsInstalled", "WorkshopItemDetails"] as const;
type Section = typeof SECTIONS[number];
export interface WorkshopRecordSnapshot {
  acfPath: string;
  physicalPath: string;
  sourceHash: string;
  items: Array<{ modId: number; sections: Record<Section, WorkshopKeyValues | null> }>;
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function readAcf(file: string): Promise<{ text: string; root: WorkshopKeyValues; app: WorkshopKeyValues; mode: number }> {
  if (!path.isAbsolute(file)) throw new Error("版本记录必须是绝对路径");
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || stat.size > 8 * 1024 * 1024) throw new Error("版本记录包含链接、异常大小或特殊文件");
  const text = await fs.readFile(file, "utf8");
  const root = parseWorkshopKeyValues(text), app = workshopSection(root.AppWorkshop);
  if (!app || app.appid !== "107410") throw new Error("不是有效的 Arma 3 Workshop 版本记录");
  return { text, root, app, mode: stat.mode & 0o777 };
}
function validId(id: number): void { if (!Number.isSafeInteger(id) || id <= 0) throw new Error("无效 Workshop ID"); }
function readItem(app: WorkshopKeyValues, section: Section, id: number): WorkshopKeyValues | null {
  const raw = app[section];
  if (raw !== undefined && !workshopSection(raw)) throw new Error("版本记录分组无效");
  const item = workshopSection(raw)?.[String(id)];
  if (item !== undefined && !workshopSection(item)) throw new Error("版本条目无效");
  return item === undefined ? null : structuredClone(workshopSection(item)!);
}

/** 只把本批次 ID 的版本记录写入运维检查点，不复制整份 ACF 覆盖其他模组。 */
export async function captureWorkshopRecords(targets: Array<{ modId: number; acfPath: string }>): Promise<WorkshopRecordSnapshot[]> {
  const grouped = new Map<string, { acfPath: string; ids: Set<number> }>();
  for (const target of targets) {
    validId(target.modId);
    const physical = physicalLockPath(target.acfPath);
    const group = grouped.get(physical) ?? { acfPath: target.acfPath, ids: new Set<number>() };
    group.ids.add(target.modId); grouped.set(physical, group);
  }
  const result: WorkshopRecordSnapshot[] = [];
  for (const [physicalPath, group] of grouped) {
    const { text, app } = await readAcf(group.acfPath);
    const items = [...group.ids].sort((a, b) => a - b).map((modId) => {
      const installed = readItem(app, "WorkshopItemsInstalled", modId);
      if (!installed) throw new Error("本批次缺少已安装版本记录，不能无证据更新");
      return { modId, sections: { WorkshopItemsInstalled: installed, WorkshopItemDetails: readItem(app, "WorkshopItemDetails", modId) } };
    });
    result.push({ acfPath: group.acfPath, physicalPath, sourceHash: hash(text), items });
  }
  return result;
}

export async function verifyWorkshopRecordsUnchanged(snapshots: WorkshopRecordSnapshot[]): Promise<void> {
  for (const saved of snapshots) {
    if (physicalLockPath(saved.acfPath) !== saved.physicalPath || hash((await readAcf(saved.acfPath)).text) !== saved.sourceHash) throw new Error("备份后的版本记录发生变化，必须重新预览");
  }
}

/** 停服前验证 ACF 及原子替换位置可写，不复制整个版本库作为恢复数据。 */
export async function probeWorkshopRecords(snapshots: WorkshopRecordSnapshot[]): Promise<void> {
  await verifyWorkshopRecordsUnchanged(snapshots);
  for (const saved of snapshots) {
    await fs.access(saved.acfPath, constants.R_OK | constants.W_OK);
    const temporary = path.join(path.dirname(saved.acfPath), `.a3st-acf-probe-${randomUUID()}`);
    const handle = await fs.open(temporary, "wx", 0o600);
    try { await handle.writeFile("a3st"); await handle.sync(); }
    finally { await handle.close(); await fs.unlink(temporary); }
  }
}

/** 调用方持有 ACF 写锁及 SteamCMD 整批队列，且下载进程已经退出。 */
export async function restoreWorkshopRecords(snapshots: WorkshopRecordSnapshot[]): Promise<void> {
  const writes: Array<{ file: string; before: string; after: string; mode: number }> = [];
  const seen = new Set<string>();
  // 任何 ACF 损坏/路径变化都先失败，不利用旧整文件快照覆盖无法识别的新记录。
  for (const saved of snapshots) {
    if (physicalLockPath(saved.acfPath) !== saved.physicalPath || seen.has(saved.physicalPath) || !saved.items.length) throw new Error("版本记录恢复范围变化或重复");
    seen.add(saved.physicalPath);
    const { text, root, app, mode } = await readAcf(saved.acfPath);
    const ids = new Set<number>();
    for (const item of saved.items) {
      validId(item.modId);
      if (ids.has(item.modId) || !workshopSection(item.sections.WorkshopItemsInstalled ?? undefined)) throw new Error("恢复版本条目无效");
      ids.add(item.modId);
      for (const section of SECTIONS) {
        const raw = app[section];
        if (raw !== undefined && !workshopSection(raw)) throw new Error("当前版本分组损坏，保留现场");
        const old = item.sections[section];
        if (old !== null && !workshopSection(old)) throw new Error("备份版本条目无效");
        const entries = workshopSection(raw) ?? Object.create(null) as WorkshopKeyValues;
        if (old === null) delete entries[String(item.modId)];
        else entries[String(item.modId)] = structuredClone(old);
        if (raw !== undefined || old !== null) app[section] = entries;
      }
    }
    // SizeOnDisk 是所有已安装记录的派生值；更新本批次条目后按现有条目重新计算。
    if (Object.hasOwn(app, "SizeOnDisk")) {
      const entries = workshopSection(app.WorkshopItemsInstalled)!;
      let size = 0n;
      for (const value of Object.values(entries)) {
        const bytes = workshopSection(value)?.size;
        if (typeof bytes !== "string" || !/^\d+$/.test(bytes)) throw new Error("已安装版本大小未知，拒绝伪造汇总记录");
        size += BigInt(bytes);
      }
      app.SizeOnDisk = size.toString();
    }
    writes.push({ file: saved.acfPath, before: text, after: stringifyWorkshopKeyValues(root), mode });
  }
  for (const item of writes) {
    if (item.before === item.after) continue;
    const temporary = path.join(path.dirname(item.file), `.a3st-acf-${randomUUID()}.tmp`);
    const handle = await fs.open(temporary, "wx", 0o600);
    try {
      try { await handle.writeFile(item.after); await handle.chmod(item.mode); await handle.sync(); } finally { await handle.close(); }
      if ((await readAcf(item.file)).text !== item.before) throw new Error("恢复期间版本记录变化，拒绝覆盖");
      await fs.rename(temporary, item.file);
    } finally { await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; }); }
  }
}
