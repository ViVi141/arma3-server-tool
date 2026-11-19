import { describe, it, expect, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { maybeAutoSnapshot } from "./auto-snapshot.js";
import type { AutoSnapshotMode } from "../settings/ui-settings.js";

function fakeApp(mode: AutoSnapshotMode, autoSnapshotAsync = false) {
  const create = vi.fn(() => "snapshot-id");
  const prune = vi.fn();
  const warn = vi.fn();
  const app = {
    uiSettingsStore: { load: () => ({ autoSnapshotMode: mode, autoSnapshotAsync }) },
    snapshotStore: { create, prune },
    log: { warn },
  };
  return { app: app as unknown as FastifyInstance, create, prune, warn };
}

describe("maybeAutoSnapshot", () => {
  it("does nothing when snapshots are disabled", () => {
    const { app, create } = fakeApp("Off");
    maybeAutoSnapshot(app, "uuid-1", "save");
    expect(create).not.toHaveBeenCalled();
  });

  it("creates the snapshot synchronously before the caller mutates config", () => {
    const { app, create, prune } = fakeApp("BeforeSave");
    maybeAutoSnapshot(app, "uuid-1", "save");
    // 同步返回时必须已快照完成（旧实现用 setImmediate 会备份到变更后的状态）。
    expect(create).toHaveBeenCalledTimes(1);
    expect(prune).toHaveBeenCalledTimes(1);
  });

  it("respects trigger semantics", () => {
    const saveOnly = fakeApp("BeforeSave");
    maybeAutoSnapshot(saveOnly.app, "uuid-1", "write");
    expect(saveOnly.create).toHaveBeenCalledTimes(1);

    const writeOnly = fakeApp("BeforeWrite");
    maybeAutoSnapshot(writeOnly.app, "uuid-1", "save");
    expect(writeOnly.create).not.toHaveBeenCalled();

    maybeAutoSnapshot(writeOnly.app, "uuid-1", "write");
    expect(writeOnly.create).toHaveBeenCalledTimes(1);
  });

  it("swallows snapshot failures but logs a warning", () => {
    const { app, create, warn } = fakeApp("BeforeSave");
    create.mockImplementation(() => {
      throw new Error("disk full");
    });
    expect(() => maybeAutoSnapshot(app, "uuid-1", "save")).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
