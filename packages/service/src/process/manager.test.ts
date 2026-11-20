import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async (original) => ({ ...await original<typeof import("node:child_process")>(), spawn }));
vi.mock("../platform/index.js", async (original) => ({ ...await original<typeof import("../platform/index.js")>(), isWindows: () => true }));
import { ProcessManager } from "./manager.js";
let dir: string, manager: ProcessManager;
function child(pid: number) { return Object.assign(new EventEmitter(), { pid, unref: vi.fn(), kill: vi.fn(), exitCode: null, signalCode: null }); }
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-spawn-")); manager = new ProcessManager(); spawn.mockReset();
  manager.register("unit", { executable: process.execPath, args: [], cwd: dir, windowsHide: true });
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

describe("维护专用无替换启动", () => {
  it("跟踪中已有进程时拒绝，不调用宽松 kill 或第二次 spawn", async () => {
    const proc = child(1001); spawn.mockReturnValue(proc); const kill = vi.spyOn(manager, "kill");
    expect(await manager.start("unit", { replace: false })).toBe(1001);
    await expect(manager.start("unit", { replace: false })).rejects.toThrow("跟踪记录");
    expect(kill).not.toHaveBeenCalled(); expect(proc.kill).not.toHaveBeenCalled(); expect(spawn).toHaveBeenCalledTimes(1);
  });
  it("已忘记旧进程的迟到 exit/error 不删除新启动的 PID 回执", async () => {
    const first = child(1001), second = child(1002); spawn.mockReturnValueOnce(first).mockReturnValueOnce(second);
    await manager.start("unit", { replace: false }); manager.forget("unit");
    await manager.start("unit", { replace: false });
    first.emit("exit", 0); first.emit("error", new Error("late event"));
    expect(manager.getPid("unit")).toBe(1002);
    second.emit("exit", 0); expect(manager.getPid("unit")).toBeUndefined();
  });
});
