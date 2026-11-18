import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  markWorkshopModContentSynced,
  readLocalUpdatedAtMs,
  resolveUpdateStatus,
  WORKSHOP_SYNC_MARKER,
} from "./workshop-update.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("workshop-update", () => {
  it("returns missing when no local path", () => {
    expect(resolveUpdateStatus(1700000000, undefined, false)).toBe("missing");
  });

  it("reads ISO updatedAt from local ref", () => {
    const ms = readLocalUpdatedAtMs({
      modId: 1,
      path: "",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(ms).toBe(Date.parse("2026-01-01T00:00:00.000Z"));
  });

  it("prefers ACF timeupdated over stale pack file mtimes", () => {
    const remote = 1_700_000_000;
    const staleLocalMs = (remote - 86_400) * 1000; // 1 day older files
    // Without ACF → outdated
    expect(resolveUpdateStatus(remote, staleLocalMs, true)).toBe("outdated");
    // With ACF matching remote → local max uses ACF seconds
    const withAcf = readLocalUpdatedAtMs({
      modId: 1,
      path: "",
      updatedAt: new Date(staleLocalMs).toISOString(),
      workshopAcfTimeUpdated: remote,
    });
    expect(withAcf).toBe(remote * 1000);
    expect(resolveUpdateStatus(remote, withAcf, true)).toBe("up_to_date");
  });

  it("marks synced content so stale children no longer look outdated", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-sync-"));
    tempDirs.push(root);
    const remote = Math.floor(Date.now() / 1000);
    const old = new Date((remote - 86_400) * 1000);
    fs.mkdirSync(path.join(root, "addons"), { recursive: true });
    fs.writeFileSync(path.join(root, "meta.cpp"), 'timestamp = 1;\n', "utf-8");
    fs.utimesSync(root, old, old);
    fs.utimesSync(path.join(root, "addons"), old, old);
    fs.utimesSync(path.join(root, "meta.cpp"), old, old);

    const before = readLocalUpdatedAtMs({ modId: 1, path: root });
    expect(resolveUpdateStatus(remote, before, true)).toBe("outdated");

    markWorkshopModContentSynced(root, new Date(remote * 1000));
    expect(fs.existsSync(path.join(root, WORKSHOP_SYNC_MARKER))).toBe(true);

    const after = readLocalUpdatedAtMs({ modId: 1, path: root });
    expect(resolveUpdateStatus(remote, after, true)).toBe("up_to_date");
  });
});
