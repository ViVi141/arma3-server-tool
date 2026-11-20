import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { MaintenanceBackups, type BackupTarget } from "./backup.js";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, copyFile: vi.fn(actual.copyFile), statfs: vi.fn(actual.statfs), rename: vi.fn(actual.rename), access: vi.fn(actual.access) };
});
let root: string;
let backups: MaintenanceBackups;
const mod = (value: string): BackupTarget => ({ path: value, kind: "directory", role: "mod" });
const file = (value: string, role: "key" | "version" = "key"): BackupTarget => ({ path: value, kind: "file", role });
async function write(relative: string, content: string): Promise<string> {
  const value = path.join(root, relative);
  await fs.mkdir(path.dirname(value), { recursive: true }); await fs.writeFile(value, content); return value;
}
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), "a3st-maint-backup-")); backups = new MaintenanceBackups(path.join(root, "data")); });
afterEach(async () => { vi.restoreAllMocks(); vi.mocked(fs.copyFile).mockClear(); await fs.rm(root, { recursive: true, force: true }); });

describe("维护批次备份与恢复", () => {
  it("仅恢复本批次模组、公钥和版本记录，保留同 ID 独立副本、其他模组及存档", async () => {
    const pbo = await write("mods/123/addons/main.pbo", "old-pbo");
    await write("mods/123/keys/old.bikey", "old-author");
    const separate = await write("separate/123/addons/main.pbo", "independent");
    const unrelated = await write("mods/456/addons/main.pbo", "unrelated");
    const playerSave = await write("profiles/save.bin", "player-save");
    const key = await write("server/Keys/123-old.bikey", "old-key");
    const otherKey = await write("server/Keys/other.bikey", "other-key");
    const version = await write("versions/123.json", "old-version");
    const newKey = path.join(root, "server", "Keys", "123-new.bikey");
    const reference = await backups.prepare("batch-one", [mod(path.join(root, "mods", "123")), file(key), file(version, "version"), file(newKey)], { downloadBytes: { [path.join(root, "mods", "123")]: 4096 } });
    await backups.verifySourcesUnchanged(reference);
    expect((await fs.readdir(path.join(backups.root, reference.batchId))).sort()).toEqual(["0", "1", "2", "manifest.json"]);
    await fs.writeFile(pbo, "partially-downloaded"); await write("mods/123/addons/new.pbo", "new-only");
    await fs.writeFile(key, "new-key"); await fs.writeFile(version, "new-version"); await fs.writeFile(newKey, "new-author");
    await expect(backups.verifySourcesUnchanged(reference)).rejects.toThrow("源文件发生变化");
    // 重建类实例代表 Service 重启，恢复依赖持久备份引用而非内存缓存。
    const reloaded = new MaintenanceBackups(path.join(root, "data"));
    await reloaded.restore(reference); await reloaded.restore(reference);
    expect(await fs.readFile(pbo, "utf8")).toBe("old-pbo");
    expect(await fs.readdir(path.dirname(pbo))).toEqual(["main.pbo"]);
    expect(await fs.readFile(key, "utf8")).toBe("old-key");
    expect(await fs.readFile(version, "utf8")).toBe("old-version");
    await expect(fs.stat(newKey)).rejects.toMatchObject({ code: "ENOENT" });
    for (const [value, content] of [[separate, "independent"], [unrelated, "unrelated"], [playerSave, "player-save"], [otherKey, "other-key"]]) expect(await fs.readFile(value, "utf8")).toBe(content);
    await backups.verify(reference);
  });

  it("磁盘不足和写权限失败发生在备份/停服前，绝不降级为无备份更新", async () => {
    const pbo = await write("mods/one/a.pbo", "original");
    vi.mocked(fs.statfs).mockResolvedValueOnce({ bavail: 1n, bsize: 1n } as Awaited<ReturnType<typeof fs.statfs>>);
    await expect(backups.prepare("disk-full", [mod(path.dirname(pbo))])).rejects.toThrow("磁盘空间不足");
    expect(vi.mocked(fs.copyFile)).not.toHaveBeenCalled();
    vi.mocked(fs.access).mockRejectedValueOnce(Object.assign(new Error("permission"), { code: "EACCES" }));
    await expect(backups.prepare("unwritable", [mod(path.dirname(pbo))])).rejects.toThrow("permission");
    expect(vi.mocked(fs.copyFile)).not.toHaveBeenCalled();
    expect(await fs.readFile(pbo, "utf8")).toBe("original");
  });

  it("部分复制失败不产生可恢复清单，不覆盖失败证据或源文件", async () => {
    const pbo = await write("mods/one/a.pbo", "original");
    vi.mocked(fs.copyFile).mockRejectedValueOnce(new Error("injected copy failure"));
    await expect(backups.prepare("copy-failed", [mod(path.dirname(pbo))])).rejects.toThrow("copy failure");
    await expect(fs.stat(path.join(backups.root, "copy-failed", "manifest.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(backups.prepare("copy-failed", [mod(path.dirname(pbo))])).rejects.toThrow("不能覆盖证据");
    expect(await fs.readFile(pbo, "utf8")).toBe("original");
  });

  it("取消备份不创建 ready 清单；备份后的内容篡改在恢复任何目标前被拒绝", async () => {
    const first = await write("keys/a.bikey", "a-old"); const second = await write("keys/b.bikey", "b-old");
    const aborted = AbortSignal.abort();
    await expect(backups.prepare("cancelled", [file(first)], { signal: aborted })).rejects.toThrow("已取消");
    const reference = await backups.prepare("corrupted", [file(first), file(second)]);
    await fs.writeFile(first, "a-new"); await fs.writeFile(second, "b-new");
    await fs.writeFile(path.join(backups.root, "corrupted", "1"), "tampered");
    await expect(backups.restore(reference)).rejects.toThrow("校验失败");
    expect(await fs.readFile(first, "utf8")).toBe("a-new");
    await expect(backups.restore({ ...reference, manifestHash: "different" })).rejects.toThrow("持久检查点不一致");
  });

  it("恢复在原目录改名后中断，下次能从备份继续恢复，不把缺失目标当作成功", async () => {
    const pbo = await write("mods/one/a.pbo", "original");
    const target = path.dirname(pbo); const reference = await backups.prepare("interrupted", [mod(target)]);
    await fs.writeFile(pbo, "new");
    const actualRename = (await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises")).rename;
    vi.mocked(fs.rename).mockImplementationOnce(actualRename).mockRejectedValueOnce(new Error("interrupted rename"));
    await expect(backups.restore(reference)).rejects.toThrow("interrupted rename");
    await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" });
    await new MaintenanceBackups(path.join(root, "data")).restore(reference);
    expect(await fs.readFile(pbo, "utf8")).toBe("original");
    await backups.verify(reference);
    expect(await fs.readdir(path.dirname(target))).toEqual(["one"]);
  });

  it("拒绝嵌套/重复范围、目录型公钥、危险批次 ID 和更新目录内部的备份", async () => {
    const pbo = await write("mods/one/addons/a.pbo", "original"); const target = path.dirname(path.dirname(pbo));
    await expect(backups.prepare("../escape", [mod(target)])).rejects.toThrow();
    await expect(backups.prepare("overlap", [mod(target), mod(path.dirname(pbo))])).rejects.toThrow("嵌套");
    await expect(backups.prepare("duplicate", [mod(target), mod(target)])).rejects.toThrow("重复");
    await expect(backups.prepare("key-dir", [{ path: target, kind: "directory", role: "key" }])).rejects.toThrow("逐文件");
    await expect(new MaintenanceBackups(target).prepare("self", [mod(target)])).rejects.toThrow("重叠");
    const alias = path.join(root, "data-alias");
    await fs.symlink(target, alias, process.platform === "win32" ? "junction" : "dir");
    await expect(new MaintenanceBackups(alias).prepare("physical-self", [mod(target)])).rejects.toThrow("重叠");
  });

  it("恢复暂存不删除可预测名称的无关目录；所有权缺失时保留现场", async () => {
    const pbo = await write("mods/one/a.pbo", "original"); const target = path.dirname(pbo);
    const reference = await backups.prepare("owned", [mod(target)]);
    const unrelated = await write("mods/.a3st-restore-owned-0/keep.txt", "user-data");
    const manifest = JSON.parse(await fs.readFile(path.join(backups.root, "owned", "manifest.json"), "utf8")) as { targets: Array<{ parent: string; restoreToken: string }> };
    const area = path.join(manifest.targets[0].parent, `.a3st-recovery-${manifest.targets[0].restoreToken}`);
    await fs.mkdir(area); await fs.writeFile(path.join(area, "unowned.txt"), "not-ours");
    await fs.writeFile(pbo, "new");
    await expect(backups.restore(reference)).rejects.toThrow("不属于本批次");
    expect(await fs.readFile(pbo, "utf8")).toBe("new");
    expect(await fs.readFile(unrelated, "utf8")).toBe("user-data");
    expect(await fs.readFile(path.join(area, "unowned.txt"), "utf8")).toBe("not-ours");
  });

  it("根 junction 按物理路径保存，目录内部链接不复制或恢复到其他资源", async () => {
    const pbo = await write("mods/one/a.pbo", "original"); const target = path.dirname(pbo);
    const alias = path.join(root, "alias");
    await fs.symlink(target, alias, process.platform === "win32" ? "junction" : "dir");
    const reference = await backups.prepare("physical", [mod(alias)]);
    await fs.writeFile(pbo, "new"); await backups.restore(reference);
    expect(await fs.readFile(path.join(alias, "a.pbo"), "utf8")).toBe("original");
    const outside = path.dirname(await write("outside/keep.pbo", "never-change"));
    await fs.symlink(outside, path.join(target, "nested"), process.platform === "win32" ? "junction" : "dir");
    await expect(backups.prepare("nested-link", [mod(target)])).rejects.toThrow("链接");
    await expect(backups.restore(reference)).rejects.toThrow("链接");
    expect(await fs.readFile(path.join(outside, "keep.pbo"), "utf8")).toBe("never-change");
  });

  it("备份保留只删除未列入保留清单的批次目录，未知文件与证据不清理", async () => {
    const pbo = await write("mods/123/a.pbo", "old");
    const first = await backups.prepare("batch-a", [mod(path.dirname(pbo))]);
    const second = await backups.prepare("batch-b", [mod(path.dirname(pbo))]);
    await fs.writeFile(path.join(backups.root, "evidence.txt"), "keep");
    expect(await backups.prune([second.batchId])).toEqual([first.batchId]);
    await expect(fs.access(path.join(backups.root, first.batchId))).rejects.toThrow();
    await expect(fs.access(path.join(backups.root, second.batchId, "manifest.json"))).resolves.toBeUndefined();
    expect(await fs.readFile(path.join(backups.root, "evidence.txt"), "utf8")).toBe("keep");
    expect(await backups.prune([second.batchId])).toEqual([]);
  });
});
