import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { computeMaintenanceImpact, loadedModPaths, type MaintenanceLoadSnapshot, type MaintenanceTarget } from "./scope.js";
import { physicalDirectory } from "../util/path-identity.js";

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st shared scope ")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
const directory = (name: string) => { const dir = path.join(root, name); fs.mkdirSync(dir, { recursive: true }); return dir; };
const snapshot = (uuid: string, paths: string[], kind: "server" | "headless" = "server"): MaintenanceLoadSnapshot => ({ serverUuid: uuid, kind, workingDirectory: root, args: [`-mod=${paths.join(";")}`, "-serverMod="] });

describe("物理共享维护范围", () => {
  it("3 服各 150 模组、50 个物理共享目录：独占只影响一服，共享只更新一次且包含 HC", () => {
    const shared: MaintenanceTarget[] = Array.from({ length: 50 }, (_, index) => ({ modId: 100000000 + index, path: directory(`shared/${index}`) }));
    const own = [1, 2, 3].map((server) => Array.from({ length: 100 }, (_, index) => ({ modId: 200000000 + server * 100 + index, path: directory(`server${server}/${index}`) })));
    const snapshots = own.map((mods, index) => snapshot(`srv-${index + 1}`, [...shared, ...mods].map((mod) => mod.path)));
    snapshots.push(snapshot("srv-2", shared.map((mod) => mod.path), "headless"));
    const independent = computeMaintenanceImpact([own[0][0]], snapshots);
    expect(independent).toMatchObject({ complete: true, serverUuids: ["srv-1"], headlessUuids: [] });
    expect(independent.resources).toHaveLength(1);
    const common = computeMaintenanceImpact([...shared, ...shared], snapshots);
    expect(common).toMatchObject({ complete: true, serverUuids: ["srv-1", "srv-2", "srv-3"], headlessUuids: ["srv-2"] });
    expect(common.resources).toHaveLength(50);
    expect(common.resources.every((resource) => resource.serverUuids.length === 3 && resource.headlessUuids[0] === "srv-2")).toBe(true);
  });
  it("junction/符号链接解析到同一资源，同 Workshop ID 的独立副本不串台", () => {
    const original = directory("original"); const copy = directory("copy"); const alias = path.join(root, "alias");
    fs.symlinkSync(original, alias, process.platform === "win32" ? "junction" : "dir");
    const refs = [snapshot("srv-1", [original]), snapshot("srv-2", [alias]), snapshot("srv-3", [copy])];
    const result = computeMaintenanceImpact([{ modId: 123, path: original }, { modId: 123, path: alias }], refs);
    expect(result).toMatchObject({ complete: true, serverUuids: ["srv-1", "srv-2"] });
    expect(result.resources).toHaveLength(1);
    const both = computeMaintenanceImpact([{ modId: 123, path: original }, { modId: 123, path: copy }], refs);
    expect(both.resources).toHaveLength(2);
    expect(both.resources.find((resource) => resource.key === physicalDirectory(copy).key)?.serverUuids).toEqual(["srv-3"]);
  });
  it("相对加载路径以实际进程工作目录为准；不由配置 ID 猜测", () => {
    const first = directory("one/@mod"); const second = directory("two/@mod");
    const refs = [snapshot("srv-1", ["@mod"]), snapshot("srv-2", ["@mod"])];
    refs[0].workingDirectory = path.dirname(first); refs[1].workingDirectory = path.dirname(second);
    const result = computeMaintenanceImpact([{ modId: 123, path: first }], refs);
    expect(result).toMatchObject({ complete: true, serverUuids: ["srv-1"] });
    refs[0].args = [`-serverMod=${first}`];
    expect(computeMaintenanceImpact([{ modId: 123, path: first }], refs).serverUuids).toEqual(["srv-1"]);
  });
  it("目标或加载证据不可读取时拒绝认为范围完整；未运行的 HC 不由本函数凭空加入", () => {
    const mod = directory("mod"); const target = { modId: 123, path: mod };
    expect(computeMaintenanceImpact([target], [{ ...snapshot("srv-1", []), args: null }])).toMatchObject({ complete: false, issues: [{ code: "RUNTIME_UNKNOWN" }] });
    expect(computeMaintenanceImpact([target], [snapshot("srv-1", [path.join(root, "missing")])])).toMatchObject({ complete: false, issues: [{ code: "LOAD_PATH_UNREADABLE" }] });
    expect(computeMaintenanceImpact([{ ...target, path: path.join(root, "missing") }], [])).toMatchObject({ complete: false, issues: [{ code: "TARGET_UNREADABLE" }] });
    expect(computeMaintenanceImpact([], [])).toMatchObject({ complete: false, resources: [] });
    expect(computeMaintenanceImpact([target], [snapshot("srv-1", [mod])]).headlessUuids).toEqual([]);
  });
  it("嵌套受管目录和一目录多 ID 必须人工核对，不能双重备份/回滚", () => {
    const parent = directory("parent"); const child = directory("parent/child");
    const nested = computeMaintenanceImpact([{ modId: 1, path: parent }, { modId: 2, path: child }], [snapshot("srv-1", [parent])]);
    expect(nested.complete).toBe(false); expect(nested.issues[0].code).toBe("OVERLAPPING_RESOURCES");
    const conflict = computeMaintenanceImpact([{ modId: 1, path: parent }, { modId: 2, path: parent }], []);
    expect(conflict.complete).toBe(false); expect(conflict.issues[0].code).toBe("RESOURCE_ID_CONFLICT");
    expect(() => computeMaintenanceImpact([{ modId: -1, path: parent }], [])).toThrow("Workshop ID");
  });
  it("模组参数支持空格路径和大小写参数名，外部参数文件和重复参数不伪装成确定范围", () => {
    const input = snapshot("srv-1", []); input.args = ["-MOD", '"folder with spaces;other"', "-serverMOD=server"];
    expect(loadedModPaths(input)).toEqual({ paths: ["folder with spaces", "other", "server"].map((value) => path.join(root, value)), complete: true });
    for (const args of [["-par=external.txt"], ["-mod=one", "-mod=two"], ["-mod"], ["-mod", "-port=2302"]]) {
      expect(loadedModPaths({ ...input, args }).complete).toBe(false);
    }
  });
  it.runIf(process.platform === "win32")("Windows 路径大小写和 junction 遵从实际目录", () => {
    const mod = directory("MixedCase");
    expect(computeMaintenanceImpact([{ modId: 123, path: mod.toUpperCase() }], [snapshot("srv-1", [mod.toLowerCase()])])).toMatchObject({ complete: true, serverUuids: ["srv-1"] });
  });
  it.runIf(process.platform !== "win32")("Linux 区分大小写，不合并两个真实目录", () => {
    const lower = directory("mod"); const upper = directory("MOD");
    const result = computeMaintenanceImpact([{ modId: 123, path: lower }], [snapshot("srv-1", [lower]), snapshot("srv-2", [upper])]);
    expect(result).toMatchObject({ complete: true, serverUuids: ["srv-1"] });
  });
});
