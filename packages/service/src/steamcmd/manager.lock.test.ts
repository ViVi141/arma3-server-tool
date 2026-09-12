import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { steamCmdBootstrapRelativePath, steamCmdEntryName } from "../platform/index.js";
import { SteamCmdManager, killSteamCmdProcessesUnderDir } from "./manager.js";

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

  it("rejects a second concurrent operation while busy", async () => {
    const mgr = makeInstalledMgr();
    const body = (
      mgr as unknown as {
        ensureInstalledBody: (runId: number) => Promise<void>;
      }
    ).ensureInstalledBody.bind(mgr);

    (
      mgr as unknown as {
        ensureInstalledBody: (runId: number) => Promise<void>;
      }
    ).ensureInstalledBody = async (runId: number) => {
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
      return body(runId);
    };

    const first = mgr.ensureInstalled();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(mgr.isBusy).toBe(true);

    let secondError = "";
    try {
      await mgr.ensureInstalled();
    } catch (e) {
      secondError = e instanceof Error ? e.message : String(e);
    }

    await first;
    expect(secondError).toContain("已在运行");
    expect(mgr.isBusy).toBe(false);
  }, 15_000);

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

  it("killSteamCmdProcessesUnderDir is safe on empty dir", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-steamcmd-purge-"));
    dirs.push(tmpDir);
    expect(killSteamCmdProcessesUnderDir(tmpDir)).toBe(0);
  });
});
