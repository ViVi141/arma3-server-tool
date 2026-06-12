import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ConfigSnapshotStore } from "./snapshot.js";
import { ConfigStore } from "./store.js";

let tmpDir: string;
let store: ConfigStore;
let snapshot: ConfigSnapshotStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-snap-test-"));
  store = new ConfigStore(tmpDir);
  snapshot = new ConfigSnapshotStore(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ConfigSnapshotStore", () => {
  it("returns empty list when no snapshots exist", () => {
    expect(snapshot.list("uuid-1")).toEqual([]);
  });

  it("creates and lists snapshots", () => {
    store.save("uuid-1", { formatVersion: 2, server: { configName: "Test" } });
    const id = snapshot.create("uuid-1", "before change");
    expect(id).toBeTypeOf("string");
    expect(id.length).toBe(12);

    const list = snapshot.list("uuid-1");
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("before change");
    expect(list[0].files).toContain("manifest.json");
    expect(list[0].files).toContain("server.json");
  });

  it("lists multiple snapshots newest first", () => {
    store.save("uuid-1", { formatVersion: 2 });
    const id1 = snapshot.create("uuid-1", "first");
    // Small delay to ensure different timestamps
    const id2 = snapshot.create("uuid-1", "second");

    const list = snapshot.list("uuid-1");
    expect(list).toHaveLength(2);
    expect(list[0].label).toBe("second");
  });

  it("restores a snapshot", () => {
    store.save("uuid-1", { formatVersion: 2, basic: { hostname: "Original" } });
    const id = snapshot.create("uuid-1", "before");

    // Change the config
    store.save("uuid-1", { formatVersion: 2, basic: { hostname: "Changed" } });
    expect(store.load("uuid-1")!.basic?.hostname).toBe("Changed");

    // Restore
    const ok = snapshot.restore("uuid-1", id);
    expect(ok).toBe(true);
    expect(store.load("uuid-1", { forceDisk: true })!.basic?.hostname).toBe("Original");
  });

  it("restore returns false for non-existent snapshot", () => {
    expect(snapshot.restore("uuid-1", "nonexistent")).toBe(false);
  });

  it("prunes old snapshots keeping N most recent", () => {
    store.save("uuid-1", { formatVersion: 2 });
    for (let i = 0; i < 15; i++) {
      snapshot.create("uuid-1", `snap-${i}`);
    }
    expect(snapshot.list("uuid-1")).toHaveLength(15);

    snapshot.prune("uuid-1", 5);
    expect(snapshot.list("uuid-1")).toHaveLength(5);
  });

  it("prune keeps all when under limit", () => {
    store.save("uuid-1", { formatVersion: 2 });
    snapshot.create("uuid-1", "only");
    snapshot.prune("uuid-1", 10);
    expect(snapshot.list("uuid-1")).toHaveLength(1);
  });

  it("create throws for non-existent config", () => {
    expect(() => snapshot.create("no-such-uuid", "bad")).toThrow("配置不存在");
  });
});
