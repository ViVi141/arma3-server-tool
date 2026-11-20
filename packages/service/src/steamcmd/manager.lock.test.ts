import { describe, it, expect, afterEach, vi } from "vitest";
import { operationSignal } from "../util/operation-context.js";
import { AsyncTaskManager } from "../task/manager.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { steamCmdBootstrapRelativePath, steamCmdEntryName } from "../platform/index.js";
import { SteamCmdManager, killSteamCmdProcessesUnderDir, type MaintenanceSteamSession } from "./manager.js";

describe("SteamCmdManager exclusive lock / abort", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  function makeInstalledMgr(): SteamCmdManager {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-steamcmd-lock-"));
    dirs.push(tmpDir);
    fs.writeFileSync(path.join(tmpDir, steamCmdEntryName()), "");
    const bootstrap = path.join(tmpDir, steamCmdBootstrapRelativePath());
    fs.mkdirSync(path.dirname(bootstrap), { recursive: true });
    fs.writeFileSync(bootstrap, "ok");
    return new SteamCmdManager(tmpDir);
  }

  it("并发请求按 FIFO 串行，失败不堵队列，排队期间设置不可变", async () => {
    const mgr = makeInstalledMgr();
    const inner = mgr as unknown as { ensureInstalledBody: (id: number) => Promise<void> };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const order: number[] = [];
    inner.ensureInstalledBody = async (id) => {
      order.push(id);
      if (order.length === 1) { await gate; throw new Error("首项失败"); }
    };
    const first = mgr.ensureInstalled().catch((error: Error) => error.message);
    const second = mgr.ensureInstalled();
    const third = mgr.ensureInstalled();
    expect(order).toHaveLength(1);
    expect(mgr.pendingCount).toBe(2);
    expect(mgr.isBusy).toBe(true);
    expect(() => mgr.setWorkshopRoot(path.join(mgr.steamCmdDir, "other"))).toThrow("队列");
    expect(() => mgr.setCredentials("changed", "secret")).toThrow("队列");
    expect(() => mgr.setLoginMode("cached")).toThrow("队列");
    expect(() => mgr.setServerInstallPath("other")).toThrow("队列");
    expect(() => mgr.setCredentials("", "")).not.toThrow();
    release();
    expect(await first).toBe("首项失败");
    await Promise.all([second, third]);
    expect(order).toEqual([1, 2, 3]);
    expect(mgr.isBusy).toBe(false);
    expect(mgr.pendingCount).toBe(0);
  });

  it("取消等待任务不影响运行项；取消运行项仍等待协程退出再放行下一项", async () => {
    const mgr = makeInstalledMgr();
    vi.spyOn(mgr, "purgeOrphanSteamCmdProcesses").mockReturnValue(0);
    const kill = vi.spyOn(mgr, "kill").mockImplementation(() => {});
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const seen: AbortSignal[] = [];
    (mgr as unknown as { ensureInstalledBody: () => Promise<void> }).ensureInstalledBody = async () => { seen.push(operationSignal.getStore()!); if (seen.length === 1) await gate; };
    const a = new AbortController(), b = new AbortController(), c = new AbortController();
    const first = operationSignal.run(a.signal, () => mgr.ensureInstalled()).catch((error: Error) => error.message);
    const second = operationSignal.run(b.signal, () => mgr.ensureInstalled()).catch((error: Error) => error.message);
    const third = operationSignal.run(c.signal, () => mgr.ensureInstalled());
    b.abort();
    expect(await second).toBe("SteamCMD 操作已取消");
    expect(kill).not.toHaveBeenCalled();
    expect(mgr.pendingCount).toBe(1);
    a.abort(); mgr.clearAbort();
    expect(kill).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([a.signal]);
    release();
    expect(await first).toBe("SteamCMD 操作已取消");
    await third;
    expect(seen).toEqual([a.signal, c.signal]);
    expect(mgr.isBusy).toBe(false);
  });

  it("全局停止撤销所有排队请求，新的请求只能等运行项收尾", async () => {
    const mgr = makeInstalledMgr();
    vi.spyOn(mgr, "purgeOrphanSteamCmdProcesses").mockReturnValue(0);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const body = vi.fn(async () => { if (body.mock.calls.length === 1) await gate; });
    (mgr as unknown as { ensureInstalledBody: () => Promise<void> }).ensureInstalledBody = body;
    const first = mgr.ensureInstalled().catch((error: Error) => error.message);
    const second = mgr.ensureInstalled().catch((error: Error) => error.message);
    mgr.requestAbort(); mgr.clearAbort();
    expect(await second).toBe("SteamCMD 操作已取消");
    const next = mgr.ensureInstalled();
    expect(body).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe("SteamCMD 操作已取消");
    await next;
    expect(body).toHaveBeenCalledTimes(2);
  });

  it("异步任务管理器实际传递取消信号，已取消的排队项从不执行", async () => {
    const mgr = makeInstalledMgr(); const tasks = new AsyncTaskManager();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const body = vi.fn(async () => { await gate; });
    (mgr as unknown as { ensureInstalledBody: () => Promise<void> }).ensureInstalledBody = body;
    const execute = async () => { await mgr.ensureInstalled(); return { success: true, message: "完成" }; };
    const first = await tasks.runAsync("one", [{ action: "ensure_steamcmd" }], execute);
    const second = await tasks.runAsync("two", [{ action: "ensure_steamcmd" }], execute);
    expect(mgr.pendingCount).toBe(1);
    tasks.cancel(second);
    expect(mgr.pendingCount).toBe(0);
    release();
    await vi.waitFor(() => expect(tasks.get(first)?.status).toBe("Succeeded"));
    expect(tasks.get(second)?.status).toBe("Cancelled");
    expect(body).toHaveBeenCalledTimes(1);
  });

  it("requestAbort invalidates in-flight run even after clearAbort", async () => {
    const mgr = makeInstalledMgr();
    const checkers = mgr as unknown as {
      ensureInstalledBody: (runId: number) => Promise<void>;
      throwIfStaleOrAborted: (runId: number) => void;
    };
    const body = checkers.ensureInstalledBody.bind(mgr);

    checkers.ensureInstalledBody = async (runId: number) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 120));
      // 旧 bug：abort 后 clearAbort 会让旧协程继续；runId 提升后这里应仍失败。
      mgr.clearAbort();
      checkers.throwIfStaleOrAborted(runId);
      return body(runId);
    };

    const op = mgr.ensureInstalled().then(
      () => "ok",
      (e: unknown) => (e instanceof Error ? e.message : String(e))
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    mgr.requestAbort();
    const msg = await op;
    expect(msg).toBe("SteamCMD 操作已取消");
    expect(mgr.isBusy).toBe(false);
  });

  it("next operation clears abort and can run after previous abort settles", async () => {
    const mgr = makeInstalledMgr();
    mgr.requestAbort();
    expect(mgr.isAborted).toBe(true);
    await mgr.ensureInstalled();
    expect(mgr.isAborted).toBe(false);
    expect(mgr.isBusy).toBe(false);
  });

  it("维护使用同一安装缓存认证、只下载一次，整批收尾后队列才放行且会话不可逃逸", async () => {
    const mgr = makeInstalledMgr(); mgr.setWorkshopRoot(mgr.steamCmdDir); mgr.setCredentials("operator", "must-not-be-used");
    vi.spyOn(mgr, "purgeOrphanSteamCmdProcesses").mockReturnValue(0);
    const args: string[] = [];
    const inner = mgr as unknown as { runCapturedProcess: (id: number, args: string, onChunk: (value: string) => void) => Promise<number> };
    inner.runCapturedProcess = async (_id, command, onChunk) => { args.push(command); onChunk(command.includes("workshop_download_item") ? "Success. Downloaded item 1 (10 bytes)" : "Logging in user 'operator' to Steam Public...OK"); return 0; };
    let release!: () => void, entered!: () => void, escaped!: MaintenanceSteamSession;
    const waiting = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const task = mgr.withMaintenanceSession(async (session) => {
      escaped = session;
      await session.authenticateCached(); await session.downloadOnce([1]);
      await expect(session.authenticateCached()).rejects.toThrow("AUTH_FAILED");
      await expect(session.downloadOnce([1])).rejects.toThrow("DOWNLOAD_FAILED");
      entered(); await gate;
    });
    await waiting;
    let next = false; const after = mgr.ensureInstalled().then(() => { next = true; });
    await Promise.resolve(); expect(next).toBe(false); expect(mgr.pendingCount).toBe(1);
    expect(args).toHaveLength(2); expect(args.join("\n")).not.toContain("must-not-be-used");
    expect(args[0]).toBe('+login "operator" +quit'); expect(args[1]).toContain("1 validate");
    expect(mgr.loginMode).toBe("password");
    release(); await task; await after;
    await expect(escaped.downloadOnce([1])).rejects.toThrow("会话已结束");
    await mgr.close();
  });

  it.each(["Logging in using cached credentials", "", "Invalid Password", "Waiting for user confirmation", "Update complete, launching SteamCMD..."])("维护认证不把尝试、空输出或 Guard 当成功：%s", async (output) => {
    const mgr = makeInstalledMgr(); mgr.setWorkshopRoot(mgr.steamCmdDir); mgr.setCredentials("operator", "unused");
    vi.spyOn(mgr, "purgeOrphanSteamCmdProcesses").mockReturnValue(0);
    const capture = vi.fn(async (_id: number, _args: string, onChunk: (value: string) => void) => { onChunk(output); return 0; });
    (mgr as unknown as { runCapturedProcess: typeof capture }).runCapturedProcess = capture;
    const download = vi.fn();
    await expect(mgr.withMaintenanceSession(async (session) => { await session.authenticateCached(); download(); await session.downloadOnce([1]); })).rejects.toThrow(/AUTH_FAILED|AUTH_REQUIRED/);
    expect(capture).toHaveBeenCalledTimes(1); expect(download).not.toHaveBeenCalled(); await mgr.close();
  });

  it("维护不能依赖 force_install_dir 隔离 Workshop 写入，也不补装缺失 SteamCMD", async () => {
    const mgr = makeInstalledMgr(); mgr.setWorkshopRoot(path.join(mgr.steamCmdDir, "other")); mgr.setCredentials("operator", "unused");
    const capture = vi.fn(); (mgr as unknown as { runCapturedProcess: typeof capture }).runCapturedProcess = capture;
    await expect(mgr.withMaintenanceSession((session) => session.authenticateCached())).rejects.toThrow("STEAM_PATH_MISMATCH");
    mgr.setWorkshopRoot(mgr.steamCmdDir); fs.unlinkSync(path.join(mgr.steamCmdDir, steamCmdEntryName()));
    await expect(mgr.withMaintenanceSession((session) => session.authenticateCached())).rejects.toThrow("STEAM_NOT_INSTALLED");
    expect(capture).not.toHaveBeenCalled(); await mgr.close();
  });

  it("维护下载部分成功不能重登重试或写同步标记", async () => {
    const mgr = makeInstalledMgr(); mgr.setWorkshopRoot(mgr.steamCmdDir); mgr.setCredentials("operator", "unused");
    vi.spyOn(mgr, "purgeOrphanSteamCmdProcesses").mockReturnValue(0);
    const capture = vi.fn(async (_id: number, args: string, onChunk: (value: string) => void) => { onChunk(args.includes("workshop_download_item") ? "Success. Downloaded item 1 (10 bytes)" : "Logged in OK"); return 0; });
    (mgr as unknown as { runCapturedProcess: typeof capture }).runCapturedProcess = capture;
    await expect(mgr.withMaintenanceSession(async (session) => { await session.authenticateCached(); await session.downloadOnce([1, 2]); })).rejects.toThrow("DOWNLOAD_FAILED");
    expect(capture).toHaveBeenCalledTimes(2);
    expect(fs.existsSync(path.join(mgr.steamCmdDir, "steamapps", "workshop", "content", "107410", "1", ".a3st-synced"))).toBe(false);
    await mgr.close();
  });

  it("killSteamCmdProcessesUnderDir is safe on empty dir", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-steamcmd-purge-"));
    dirs.push(tmpDir);
    expect(killSteamCmdProcessesUnderDir(tmpDir)).toBe(0);
  });
});
