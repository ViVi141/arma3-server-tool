import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SteamCmdManager } from "./manager.js";

describe("SteamCmdManager capture", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-steamcmd-test-"));

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("getAggregatedLog returns latest session console capture", () => {
    const sessionDir = path.join(tmpDir, "logs", "steamcmd");
    fs.mkdirSync(sessionDir, { recursive: true });
    const logPath = path.join(sessionDir, "steamcmd_20260612_205500.log");
    fs.writeFileSync(
      logPath,
      "时间: 2026-06-12\n--- console ---\nLogging in user...\nSuccess. Downloaded item 123\n"
    );

    const manager = new SteamCmdManager(tmpDir);
    const aggregated = manager.getAggregatedLog(50);
    expect(aggregated).toContain("Success. Downloaded item 123");
    expect(aggregated).not.toContain("content_log.txt");
  });

});
