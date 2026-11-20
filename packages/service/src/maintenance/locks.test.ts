import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { MaintenanceLocks, maintenanceLocks, MaintenanceLockError, physicalLockPath } from "./locks.js";
import { ConfigStore } from "../config/store.js";
import { SteamCmdManager } from "../steamcmd/manager.js";
import { copyBikeysForMod } from "../mods/bikey-service.js";
import { startServer, restartServer, stopServer, detectRestartServer } from "../scheduling/server-lifecycle.js";
import { startHeadlessClient } from "../process/headless.js";
import { writeAll } from "../config/game-config-writer.js";
import type { FastifyInstance } from "fastify";

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-maint-locks-")); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
const write = (value: string) => ({ paths: [{ path: value, mode: "write" as const }] });
const read = (value: string) => ({ paths: [{ path: value, mode: "read" as const }] });

describe("维护租约与普通入口共用互斥", () => {
  it("按物理路径锁定 junction、父子目录及缺失子路径，不合并同 ID 独立副本", () => {
    const locks = new MaintenanceLocks();
    const mod = path.join(root, "one", "123"); fs.mkdirSync(mod, { recursive: true });
    const alias = path.join(root, "alias"); fs.symlinkSync(mod, alias, process.platform === "win32" ? "junction" : "dir");
    const lease = locks.acquire(write(mod));
    try {
      for (const p of [alias, path.join(alias, "new.pbo"), path.dirname(mod)]) expect(() => locks.acquire(write(p))).toThrow(MaintenanceLockError);
      expect(() => locks.assertAvailable(read(mod))).toThrow(MaintenanceLockError);
      expect(() => locks.assertAvailable(write(path.join(root, "two", "123")))).not.toThrow();
      expect(() => locks.assertAvailable(write(`${mod}-extra`))).not.toThrow();
      lease.run(() => expect(() => locks.assertAvailable(write(alias))).not.toThrow());
    } finally { lease.release(); }
    expect(() => lease.run(() => {})).toThrow("已释放");
    expect(() => locks.assertAvailable(write(alias))).not.toThrow();
    expect(physicalLockPath(path.join(alias, "new", "key"))).toBe(physicalLockPath(path.join(mod, "new", "key")));
  });

  it("读租约可并行；批量获取冲突不残留部分锁；异常和异步结束释放锁", async () => {
    const locks = new MaintenanceLocks(); const a = locks.acquire(read(root)); const b = locks.acquire(read(root));
    expect(() => locks.acquire({ instances: ["s"], ...write(root) })).toThrow(MaintenanceLockError);
    const unrelated = locks.acquire({ instances: ["s"] }); unrelated.release(); a.release(); b.release();
    let release!: () => void;
    const pending = locks.run(write(root), async () => { await new Promise<void>((resolve) => { release = resolve; }); throw new Error("failed"); });
    const failed = expect(pending).rejects.toThrow("failed");
    expect(() => locks.assertAvailable(read(root))).toThrow(MaintenanceLockError);
    release(); await failed; expect(() => locks.assertAvailable(write(root))).not.toThrow();
  });

  it("实例锁挡住配置、启动、检测重启和 HC；持有者内部调用允许嵌套", async () => {
    const store = new ConfigStore(root); const config = { formatVersion: 2, server: { serverDir: path.join(root, "server") }, tasks: { enableHeadlessClient: true } };
    store.save("s", config);
    const app = { configStore: store, processManager: { getState: vi.fn(async () => ({ isRunning: false })) } } as unknown as FastifyInstance;
    const lease = maintenanceLocks.acquire({ instances: ["s"] });
    try {
      expect(() => store.save("s", config)).toThrow(MaintenanceLockError);
      expect(() => store.patchSection("s", "tasks", { processById: 4 })).toThrow(MaintenanceLockError);
      expect(() => store.delete("s")).toThrow(MaintenanceLockError);
      expect(writeAll("s", config).success).toBe(false);
      for (const start of [startServer, stopServer, restartServer, detectRestartServer]) expect((await start(app, "s")).success).toBe(false);
      expect(() => startHeadlessClient(app, "s", config)).toThrow(MaintenanceLockError);
      lease.run(() => expect(() => store.save("s", config)).not.toThrow());
      expect(fs.existsSync(config.server.serverDir)).toBe(false);
      expect(() => store.save("other", config)).not.toThrow();
    } finally { lease.release(); }
  });

  it("SteamCMD 出队后检查目录锁，受锁下载不调用安装/登录；公钥部署也不得写入", async () => {
    const manager = new SteamCmdManager(root); vi.spyOn(manager, "purgeOrphanSteamCmdProcesses").mockReturnValue(0);
    const workshop = path.join(root, "workshop"); manager.setWorkshopRoot(workshop);
    const mod = path.join(workshop, "steamapps", "workshop", "content", "107410", "123");
    const inner = manager as unknown as { ensureInstalledBody: () => Promise<void> }; inner.ensureInstalledBody = vi.fn(async () => {});
    const lease = maintenanceLocks.acquire(write(mod));
    try { await expect(manager.downloadWorkshopMods([123])).rejects.toThrow(MaintenanceLockError); expect(inner.ensureInstalledBody).not.toHaveBeenCalled(); }
    finally { lease.release(); await manager.close(); }
    const server = path.join(root, "server"); const keys = maintenanceLocks.acquire(write(path.join(server, "Keys")));
    try { expect(() => copyBikeysForMod(mod, "123", server)).toThrow(MaintenanceLockError); expect(fs.existsSync(server)).toBe(false); }
    finally { keys.release(); }
  });
});
