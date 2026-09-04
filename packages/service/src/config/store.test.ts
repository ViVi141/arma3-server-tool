import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ConfigStore } from "./store.js";

let tmpDir: string;
let store: ConfigStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-config-test-"));
  store = new ConfigStore(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ConfigStore", () => {
  it("returns empty list initially", () => {
    expect(store.listServers()).toEqual([]);
  });

  it("saves and loads a config", () => {
    store.save("uuid-1", { formatVersion: 2, server: { configName: "My Server" } });

    const loaded = store.load("uuid-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.formatVersion).toBe(2);
    expect(loaded!.server?.configName).toBe("My Server");
  });

  it("lists saved servers", () => {
    store.save("uuid-1", { formatVersion: 2 }, "Server A");
    store.save("uuid-2", { formatVersion: 2 }, "Server B");

    const list = store.listServers();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.configName).sort()).toEqual(["Server A", "Server B"]);
  });

  it("preserves manifest configName when save omits explicit name", () => {
    store.save("uuid-1", { formatVersion: 2, server: { configName: "作训服" } }, "作训服");
    store.save("uuid-1", {
      formatVersion: 2,
      server: { configName: "作训服", serverDir: "C:\\arma3" },
      tasks: { processById: 1234 },
    });

    const list = store.listServers();
    expect(list).toHaveLength(1);
    expect(list[0].configName).toBe("作训服");
  });

  it("preserves scheduler and monitoring sections", () => {
    store.save("uuid-1", {
      formatVersion: 2,
      scheduler: { restartCron: "0 4 * * *", monitoringCron: "*/5 * * * *" },
      monitoring: { enabled: true, modEnabled: true },
    });

    const loaded = store.load("uuid-1");
    expect(loaded!.scheduler?.restartCron).toBe("0 4 * * *");
    expect(loaded!.monitoring?.enabled).toBe(true);
  });

  it("preserves all config sections", () => {
    store.save("uuid-1", {
      formatVersion: 2,
      server: { configName: "Test", serverDir: "C:\\arma3", executable: "arma3server_x64.exe" },
      startup: { parameters: "-world=empty", restartOnCrash: true },
      basic: { hostname: "My Server", maxPlayers: 64 },
      battleye: { rconPort: 2302, rconPassword: "secret" },
    });

    const loaded = store.load("uuid-1");
    expect(loaded!.server?.serverDir).toBe("C:\\arma3");
    expect(loaded!.startup?.restartOnCrash).toBe(true);
    expect(loaded!.basic?.maxPlayers).toBe(64);
    expect(loaded!.battleye?.rconPort).toBe(2302);
  });

  it("deletes a server", () => {
    store.save("uuid-1", { formatVersion: 2 });
    expect(store.load("uuid-1")).not.toBeNull();

    store.delete("uuid-1");
    expect(store.load("uuid-1")).toBeNull();
    expect(store.listServers()).toHaveLength(0);
  });

  it("delete returns false for non-existent", () => {
    expect(store.delete("nonexistent")).toBe(false);
  });

  it("handles concurrent saves (last write wins)", () => {
    store.save("uuid-1", { formatVersion: 2, basic: { hostname: "First" } });
    store.save("uuid-1", { formatVersion: 2, basic: { hostname: "Second" } });

    const loaded = store.load("uuid-1");
    expect(loaded!.basic?.hostname).toBe("Second");
  });

  it("returns null for non-existent UUID", () => {
    expect(store.load("does-not-exist")).toBeNull();
  });

  it("survives partial corruption (skips bad files)", () => {
    const pkgDir = path.join(tmpDir, "config", "uuid-1");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, "garbage.json"), "not valid json{{{", "utf-8");

    // Should not throw, should return null or empty
    const loaded = store.load("uuid-1");
    expect(loaded).not.toBeNull();
  });
});
