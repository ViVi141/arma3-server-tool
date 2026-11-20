import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getConfigRoot, getServerExecutablePath } from "../config/game-config-writer.js";
import type { ProcessRuntime, RuntimeInventory } from "../process/runtime.js";
import { impactFromRuntime, mapMaintenanceRuntime, type RuntimeConfiguration } from "./runtime.js";

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-runtime-map-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
const dir = (name: string) => { const value = path.join(root, name); fs.mkdirSync(value, { recursive: true }); return value; };
function config(uuid = "s"): RuntimeConfiguration {
  return { uuid, config: { formatVersion: 2, server: { serverDir: dir(uuid) }, startup: { port: 2302 } }, planned: [] };
}
function proc(c: RuntimeConfiguration, headless = false): ProcessRuntime {
  return { pid: headless ? 12 : 11, executable: getServerExecutablePath(c.config), workingDirectory: c.config.server!.serverDir!, session: "session:1",
    args: [`-name=${c.uuid}${headless ? "_hc" : ""}`, `-profiles=${path.join(getConfigRoot(c.config.server!.serverDir!, c.uuid), headless ? "headless" : "")}`, ...(headless ? ["-client"] : ["-port=2302"])] };
}
const inventory = (processes: ProcessRuntime[] = []): RuntimeInventory => ({ complete: true, processes, unknownPids: [] });

describe("维护 OS 清单映射", () => {
  it("只有完整枚举才确认停止；权限失败不能当作无人", () => {
    const c = config();
    expect(mapMaintenanceRuntime([c], inventory()).instances[0]).toMatchObject({ serverRunning: false, headlessRunning: false });
    for (const value of [{ ...inventory(), complete: false }, { ...inventory(), unknownPids: [99] }]) {
      const result = mapMaintenanceRuntime([c], value);
      expect(result.instances[0]).toMatchObject({ serverRunning: null, headlessRunning: null });
      expect(result.issues[0].code).toBe("RUNTIME_UNKNOWN");
    }
  });
  it("实际加载路径和计划路径共同约束；关闭 HC 配置不掩盖正在运行的 HC", () => {
    const c = config(); const actual = dir("actual"); const desired = dir("desired");
    c.planned = [{ serverUuid: c.uuid, kind: "server", workingDirectory: root, args: [`-mod=${desired}`] }];
    const server = proc(c); server.args.push(`-mod=${actual}`);
    const hc = proc(c, true); hc.args.push(`-mod=${actual}`);
    const runtime = mapMaintenanceRuntime([c], inventory([server, hc]));
    expect(runtime.instances[0]).toMatchObject({ serverRunning: true, headlessRunning: true, server: { session: "session:1" } });
    expect(impactFromRuntime([{ modId: 1, path: actual }], runtime)).toMatchObject({ complete: true, serverUuids: ["s"], headlessUuids: ["s"] });
    expect(impactFromRuntime([{ modId: 1, path: desired }], runtime)).toMatchObject({ complete: true, serverUuids: ["s"], headlessUuids: [] });
  });
  it("严格匹配 name/profile/port/executable，重复标记不被误判为停止", () => {
    const c = config();
    for (const change of [
      (p: ProcessRuntime) => { p.args[1] = `-profiles=${root}`; },
      (p: ProcessRuntime) => { p.args[2] = "-port=2402"; },
      (p: ProcessRuntime) => { p.executable = path.join(root, "wrong.exe"); },
      (p: ProcessRuntime) => { p.args.push("-name=other"); },
    ]) {
      const p = proc(c); change(p);
      expect(mapMaintenanceRuntime([c], inventory([p])).instances[0].serverRunning).toBeNull();
    }
    const p = proc(c);
    expect(mapMaintenanceRuntime([c], inventory([p, { ...p, pid: 13, session: "new" }])).instances[0].serverRunning).toBeNull();
    p.args[0] = "-name=s-prefix";
    expect(mapMaintenanceRuntime([c], inventory([p])).instances[0].serverRunning).toBe(false);
  });
  it("未托管进程仅在加载目标目录时阻断；同 ID 副本与相对 cwd 不串台", () => {
    const c = config(); const actual = dir("one/mod"); const copy = dir("two/mod");
    const p = proc(c); p.args.push(`-mod=${actual}`);
    const other = { ...proc(config("other")), pid: 99, workingDirectory: path.dirname(copy) }; other.args.push("-mod=mod");
    const result = mapMaintenanceRuntime([c], inventory([p, other]));
    expect(impactFromRuntime([{ modId: 1, path: actual }], result)).toMatchObject({ complete: true, serverUuids: ["s"] });
    expect(impactFromRuntime([{ modId: 1, path: copy }], result)).toMatchObject({ complete: false, serverUuids: ["unmanaged:99"] });
  });
});
