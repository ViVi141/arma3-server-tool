import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { configuredPathKey } from "../util/path-identity.js";
import { assertSafeId } from "../util/upload-safety.js";
import type { WorkshopRecordSnapshot } from "./version-records.js";

export interface BackupTarget {
  path: string;
  kind: "directory" | "file";
  role: "mod" | "key" | "version";
}
interface BackupEntry { relative: string; kind: "directory" | "file"; size: number; hash: string | null; mode: number; mtimeMs: number }
interface SavedTarget extends BackupTarget { entries: BackupEntry[]; parent: string; existed: boolean; slot: string; restoreToken: string }
export interface BackupReference { batchId: string; manifestHash: string; workshopRecords?: WorkshopRecordSnapshot[] }
interface BackupManifest { version: 1; batchId: string; createdAt: string; targets: SavedTarget[] }
interface BackupOptions {
  /** 调用方从目标远程版本取得的下载空间预算，按原目标路径传入。 */
  downloadBytes?: Record<string, number>;
  signal?: AbortSignal;
}
const RESERVE_BYTES = 64n * 1024n * 1024n;
const hashText = (text: string) => createHash("sha256").update(text).digest("hex");
function cancelled(signal?: AbortSignal): void { if (signal?.aborted) throw new Error("维护备份已取消，未授权停服"); }
function inside(root: string, candidate: string): boolean {
  const relative = path.relative(configuredPathKey(root), configuredPathKey(candidate));
  return !relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
async function statOrMissing(value: string) {
  try { return await fs.lstat(value); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function nearestDirectory(value: string): Promise<string> {
  let candidate = value;
  while (!(await statOrMissing(candidate))) {
    const parent = path.dirname(candidate);
    if (parent === candidate) throw new Error("备份目标没有可用的父目录");
    candidate = parent;
  }
  const real = await fs.realpath(candidate);
  if (!(await fs.stat(real)).isDirectory()) throw new Error("备份目标父路径不是目录");
  return real;
}
async function canonicalTarget(target: BackupTarget, allowMissingDirectory = false): Promise<BackupTarget & { parent: string }> {
  if (!path.isAbsolute(target.path) || target.path === path.parse(target.path).root) throw new Error("备份目标必须是非根目录的绝对路径");
  if ((target.role === "mod") !== (target.kind === "directory")) throw new Error("仅模组可按目录备份；公钥和版本记录必须逐文件指定");
  const exists = await statOrMissing(target.path);
  if (!exists && target.kind === "directory" && !allowMissingDirectory) throw new Error("受管模组目录不存在，不能无备份更新");
  if (target.kind === "file" && exists?.isSymbolicLink()) throw new Error("公钥或版本记录是链接，不能安全原位恢复");
  const parent = await nearestDirectory(path.dirname(target.path));
  const lexicalParent = path.dirname(target.path);
  // 缺失文件只解析其现存父目录；不能提前创建目标公钥目录。
  let ancestor = lexicalParent;
  while (!(await statOrMissing(ancestor))) ancestor = path.dirname(ancestor);
  const canonical = exists ? await fs.realpath(target.path) : path.join(parent, path.relative(ancestor, target.path));
  return { ...target, path: canonical, parent: await nearestDirectory(path.dirname(canonical)) };
}
async function fileHash(file: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { signal })) { cancelled(signal); hash.update(chunk); }
  return hash.digest("hex");
}
async function inventory(root: string, kind: BackupTarget["kind"], signal?: AbortSignal): Promise<BackupEntry[]> {
  const result: BackupEntry[] = [];
  let device: number | undefined;
  async function visit(relative: string): Promise<void> {
    cancelled(signal);
    const value = relative ? path.join(root, relative) : root;
    const stat = await fs.lstat(value);
    device ??= stat.dev;
    if (device !== stat.dev) throw new Error("受管目录内存在跨设备挂载，不能安全原位恢复");
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()) || (stat.isFile() && stat.nlink > 1)) throw new Error("受管目录包含链接或特殊文件，不能安全原位更新");
    if (!relative && (kind === "directory") !== stat.isDirectory()) throw new Error("备份目标类型发生变化");
    result.push({ relative, kind: stat.isDirectory() ? "directory" : "file", size: stat.isFile() ? stat.size : 0,
      hash: stat.isFile() ? await fileHash(value, signal) : null, mode: stat.mode, mtimeMs: stat.mtimeMs });
    if (stat.isDirectory()) for (const name of (await fs.readdir(value)).sort()) await visit(path.join(relative, name));
  }
  if (await statOrMissing(root)) await visit("");
  return result;
}
function sameContents(a: BackupEntry[], b: BackupEntry[]): boolean {
  const content = (items: BackupEntry[]) => items.map(({ relative, kind, size, hash }) => ({ relative, kind, size, hash }));
  return JSON.stringify(content(a)) === JSON.stringify(content(b));
}
async function syncFile(file: string): Promise<void> {
  const handle = await fs.open(file, "r+");
  try { await handle.sync(); } finally { await handle.close(); }
}
async function probeDirectory(directory: string): Promise<void> {
  await fs.access(directory, constants.R_OK | constants.W_OK | constants.X_OK);
  const probe = path.join(directory, `.a3st-write-probe-${randomUUID()}`);
  const handle = await fs.open(probe, "wx", 0o600);
  try { await handle.writeFile("a3st"); await handle.sync(); }
  finally { await handle.close(); await fs.unlink(probe); }
}
async function copyInventory(source: string, destination: string, entries: BackupEntry[], signal?: AbortSignal): Promise<void> {
  for (const entry of entries) {
    cancelled(signal);
    const from = path.join(source, entry.relative), to = path.join(destination, entry.relative);
    if (entry.kind === "directory") await fs.mkdir(to, { recursive: true });
    else {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to, constants.COPYFILE_EXCL);
      await syncFile(to);
      await fs.chmod(to, entry.mode & 0o777);
      await fs.utimes(to, new Date(entry.mtimeMs), new Date(entry.mtimeMs));
    }
  }
  for (const entry of [...entries].reverse()) if (entry.kind === "directory") {
    const to = path.join(destination, entry.relative);
    await fs.chmod(to, entry.mode & 0o777);
    await fs.utimes(to, new Date(entry.mtimeMs), new Date(entry.mtimeMs));
  }
}

/** 下载后的目录也必须拒绝链接/跨设备/特殊文件，不能让公钥扫描越出受管范围。 */
export async function verifyManagedDirectory(directory: string, signal?: AbortSignal): Promise<void> {
  const target = await canonicalTarget({ path: directory, kind: "directory", role: "mod" });
  if (!(await inventory(target.path, "directory", signal)).length) throw new Error("受管目录缺失");
}

/** 仅处理已明确列出的本批次目录/文件；无备份、磁盘不足或校验失败都必须在停服前退出。 */
export class MaintenanceBackups {
  readonly root: string;
  constructor(dataDir: string) { this.root = path.join(path.resolve(dataDir), "maintenance-backups"); }
  private directory(batchId: string): string { assertSafeId(batchId, "维护批次 ID"); return path.join(this.root, batchId); }

  async prepare(batchId: string, targets: BackupTarget[], options: BackupOptions = {}): Promise<BackupReference> {
    const batch = this.directory(batchId);
    if (!targets.length) throw new Error("备份范围为空");
    if (await statOrMissing(batch)) throw new Error("该批次已有备份或未完成备份，不能覆盖证据");
    cancelled(options.signal);
    const canonical = await Promise.all(targets.map((target) => canonicalTarget(target)));
    const backupLocation = await canonicalTarget({ path: this.root, kind: "file", role: "version" });
    for (let i = 0; i < canonical.length; i++) {
      if (inside(canonical[i].path, backupLocation.path) || inside(backupLocation.path, canonical[i].path)) throw new Error("备份目录与更新范围重叠");
      for (let j = 0; j < i; j++) if (inside(canonical[i].path, canonical[j].path) || inside(canonical[j].path, canonical[i].path)) throw new Error("备份范围重复或嵌套");
    }
    const saved: SavedTarget[] = [];
    const volumes = new Map<string, { directory: string; bytes: bigint }>();
    const addSpace = async (directory: string, bytes: bigint) => {
      const stat = await fs.stat(directory, { bigint: true }); const key = String(stat.dev);
      const previous = volumes.get(key);
      volumes.set(key, { directory, bytes: bytes + (previous?.bytes ?? 0n) });
    };
    let backupBytes = 0n;
    for (let i = 0; i < canonical.length; i++) {
      const target = canonical[i];
      const entries = await inventory(target.path, target.kind, options.signal);
      const bytes = entries.reduce((sum, entry) => sum + BigInt(entry.size), 0n);
      const download = options.downloadBytes?.[targets[i].path] ?? (target.role === "mod" ? Number(bytes) : 0);
      if (!Number.isSafeInteger(download) || download < 0) throw new Error("下载空间预算无效");
      backupBytes += bytes;
      // 同盘时累计备份、恢复暂存和本轮下载预算，不能对同一可用空间重复记账。
      await addSpace(target.parent, bytes + BigInt(download));
      saved.push({ ...target, entries, existed: entries.length > 0, slot: String(i), restoreToken: randomUUID() });
    }
    const backupParent = await nearestDirectory(backupLocation.path);
    await addSpace(backupParent, backupBytes);
    for (const { directory, bytes } of volumes.values()) {
      const stat = await fs.statfs(directory, { bigint: true });
      if (stat.bavail * stat.bsize < bytes + RESERVE_BYTES) throw new Error("磁盘空间不足：必须同时保留备份、下载和恢复空间，未授权停服");
    }
    for (const directory of new Set([backupParent, ...saved.map((target) => target.parent)])) await probeDirectory(directory);
    for (const target of saved) for (const entry of target.entries) {
      const value = path.join(target.path, entry.relative);
      if (entry.kind === "directory") await probeDirectory(value);
      else await fs.access(value, constants.R_OK | constants.W_OK);
    }
    await fs.mkdir(this.root, { recursive: true });
    await fs.mkdir(batch);
    // 部分备份不清理、不写 ready manifest，下次不得把它当作可恢复备份。
    for (const target of saved) {
      const destination = path.join(batch, target.slot);
      await copyInventory(target.path, destination, target.entries, options.signal);
      const copied = await inventory(destination, target.kind, options.signal);
      const current = await inventory(target.path, target.kind, options.signal);
      if (!sameContents(target.entries, copied) || !sameContents(target.entries, current)) throw new Error("备份期间源文件变化或副本校验失败，未授权停服");
    }
    const manifest: BackupManifest = { version: 1, batchId, createdAt: new Date().toISOString(), targets: saved };
    const text = JSON.stringify(manifest);
    const temp = path.join(batch, "manifest.tmp");
    await fs.writeFile(temp, text, { flag: "wx", mode: 0o600 });
    await syncFile(temp);
    cancelled(options.signal);
    await fs.rename(temp, path.join(batch, "manifest.json"));
    return { batchId, manifestHash: hashText(text) };
  }

  private async verified(reference: BackupReference): Promise<BackupManifest> {
    const batch = this.directory(reference.batchId);
    const text = await fs.readFile(path.join(batch, "manifest.json"), "utf8");
    if (hashText(text) !== reference.manifestHash) throw new Error("备份清单与持久检查点不一致，拒绝恢复");
    const manifest = JSON.parse(text) as BackupManifest;
    if (manifest.version !== 1 || manifest.batchId !== reference.batchId || !manifest.targets?.length) throw new Error("备份清单无效");
    for (let i = 0; i < manifest.targets.length; i++) {
      const target = manifest.targets[i];
      if (target.slot !== String(i) || !path.isAbsolute(target.path) || target.entries.some((entry) => path.isAbsolute(entry.relative) || !inside(target.path, path.resolve(target.path, entry.relative)))) throw new Error("备份清单包含越界路径");
      const copied = await inventory(path.join(batch, target.slot), target.kind);
      if (!sameContents(target.entries, copied)) throw new Error("备份文件校验失败，保留现场并要求人工介入");
    }
    return manifest;
  }

  async verify(reference: BackupReference): Promise<void> { await this.verified(reference); }

  async verifySourcesUnchanged(reference: BackupReference): Promise<void> {
    const manifest = await this.verified(reference);
    for (const target of manifest.targets) {
      const current = await canonicalTarget(target);
      if (configuredPathKey(current.path) !== configuredPathKey(target.path) || !sameContents(target.entries, await inventory(target.path, target.kind))) throw new Error("备份后源文件发生变化，必须重新预览和备份，未授权停服");
    }
  }

  /**
   * 只删除 keep 之外的批次备份目录；调用方必须把未解决故障、在途批次和最近成功批次的全部引用传入。
   * 未知条目、链接和非普通目录一律保留，不能借清理之名删除现场证据。
   */
  async prune(keep: Iterable<string>): Promise<string[]> {
    const retained = new Set(keep);
    const removed: string[] = [];
    if (!(await statOrMissing(this.root))) return removed;
    const root = await fs.lstat(this.root);
    if (!root.isDirectory() || root.isSymbolicLink()) throw new Error("备份根目录不是普通目录，拒绝自动清理");
    for (const name of await fs.readdir(this.root)) {
      if (retained.has(name)) continue;
      const target = path.join(this.root, name);
      const stat = await fs.lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      assertSafeId(name, "维护批次 ID");
      await fs.rm(target, { recursive: true, force: true });
      removed.push(name);
    }
    return removed;
  }

  /** 调用方必须先持有维护锁并确认进程退出；恢复不遵循用户取消信号，避免取消破坏回滚。 */
  async restore(reference: BackupReference): Promise<void> {
    const manifest = await this.verified(reference);
    // 先检查全部父路径、目标类型/链接，任何一项不安全都不开始覆盖。
    for (const target of manifest.targets) {
      const current = await canonicalTarget(target, true);
      if (configuredPathKey(current.path) !== configuredPathKey(target.path) || !inside(target.parent, current.parent)) throw new Error("恢复目标物理路径已改变，拒绝覆盖");
      await inventory(target.path, target.kind);
      await probeDirectory(await nearestDirectory(path.dirname(target.path)));
    }
    for (const target of manifest.targets) {
      if (typeof target.restoreToken !== "string" || !/^[a-f0-9-]{36}$/.test(target.restoreToken)) throw new Error("备份缺少恢复暂存所有权证据，请人工恢复");
      const area = path.join(target.parent, `.a3st-recovery-${target.restoreToken}`);
      const marker = path.join(area, "owner");
      if (!(await statOrMissing(area))) {
        await fs.mkdir(area, { mode: 0o700 });
        await fs.writeFile(marker, `${reference.manifestHash}:${target.slot}`, { flag: "wx", mode: 0o600 });
        await syncFile(marker);
      } else {
        const areaStat = await fs.lstat(area), markerStat = await statOrMissing(marker);
        if (!areaStat.isDirectory() || areaStat.isSymbolicLink() || !markerStat?.isFile() || markerStat.isSymbolicLink() || markerStat.nlink !== 1 || await fs.readFile(marker, "utf8") !== `${reference.manifestHash}:${target.slot}`) throw new Error("恢复暂存目录不属于本批次，保留现场");
        if ((await fs.readdir(area)).some((name) => !["owner", "staged", "displaced"].includes(name))) throw new Error("恢复暂存目录包含未知文件，保留现场");
      }
      const staged = path.join(area, "staged");
      const displaced = path.join(area, "displaced");
      if (await statOrMissing(staged)) {
        await inventory(staged, target.kind);
        await fs.rm(staged, { recursive: true, force: true });
      }
      if (target.existed) {
        await copyInventory(path.join(this.directory(reference.batchId), target.slot), staged, target.entries);
        if (!sameContents(target.entries, await inventory(staged, target.kind))) throw new Error("恢复暂存文件校验失败");
      }
      if (await statOrMissing(displaced)) {
        await inventory(displaced, target.kind);
        // 上次中断保留的新版文件仍在；只有当前目标已存在时才清理旧隔离副本。
        if (await statOrMissing(target.path)) await fs.rm(displaced, { recursive: true, force: true });
      }
      if (await statOrMissing(target.path)) await fs.rename(target.path, displaced);
      if (target.existed) {
        await fs.mkdir(path.dirname(target.path), { recursive: true });
        await fs.rename(staged, target.path);
      }
      if (!sameContents(target.entries, await inventory(target.path, target.kind))) throw new Error("恢复后的目标校验失败");
      if (await statOrMissing(displaced)) await fs.rm(displaced, { recursive: true, force: true });
      await fs.unlink(marker);
      await fs.rmdir(area);
    }
    // 原备份始终保留；由已确认成功的批次保留策略单独处理。
  }
}
