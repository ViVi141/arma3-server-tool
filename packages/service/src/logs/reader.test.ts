import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { RptLogReader } from "./reader.js";

let tmpDir: string;
let reader: RptLogReader;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-rpt-test-"));
  reader = new RptLogReader();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function touch(filePath: string, content = "", mtime?: Date): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  if (mtime) fs.utimesSync(filePath, mtime, mtime);
}

const TEST_UUID = "00000000-0000-0000-0000-000000000001";

describe("RptLogReader", () => {
  it("listLogs returns empty for missing server dir", () => {
    expect(reader.listLogs("/does/not/exist", TEST_UUID, "rpt")).toEqual([]);
  });

  it("listLogs finds .rpt files", () => {
    touch(path.join(tmpDir, "server_2025.rpt"), "line1\nline2");
    touch(path.join(tmpDir, "server_2024.rpt"), "old");
    touch(path.join(tmpDir, "readme.txt"), "not log");

    const logs = reader.listLogs(tmpDir, TEST_UUID, "rpt");
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.fileName.endsWith(".rpt"))).toBe(true);
  });

  it("listLogs filters by kind", () => {
    touch(path.join(tmpDir, "server.rpt"));
    touch(path.join(tmpDir, "BattlEye", "battleye.log"));

    expect(reader.listLogs(tmpDir, TEST_UUID, "rpt")).toHaveLength(1);
    expect(reader.listLogs(tmpDir, TEST_UUID, "battleye")).toHaveLength(1);
    expect(reader.listLogs(tmpDir, TEST_UUID, "all")).toHaveLength(2);
  });

  it("listLogs sorts by newest first", () => {
    const old = new Date("2024-01-01");
    const recent = new Date("2025-01-01");
    touch(path.join(tmpDir, "old.rpt"), "old", old);
    touch(path.join(tmpDir, "recent.rpt"), "recent", recent);

    const logs = reader.listLogs(tmpDir, TEST_UUID, "rpt");
    expect(logs[0].fileName).toBe("recent.rpt");
  });

  it("readLog returns file contents", () => {
    touch(path.join(tmpDir, "test.rpt"), "line1\nline2\nline3");
    const result = reader.readLog(path.join(tmpDir, "test.rpt"));
    expect(result.lines).toEqual(["line1", "line2", "line3"]);
    expect(result.totalLines).toBe(3);
  });

  it("readLog respects maxLines", () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line${i + 1}`).join("\n");
    touch(path.join(tmpDir, "big.rpt"), lines);
    const result = reader.readLog(path.join(tmpDir, "big.rpt"), 5);
    expect(result.lines).toHaveLength(5);
    expect(result.offset).toBe(100);
  });

  it("readLog with startOffset", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n");
    touch(path.join(tmpDir, "offset.rpt"), lines);
    const result = reader.readLog(path.join(tmpDir, "offset.rpt"), 5, 10);
    expect(result.lines[0]).toBe("line11");
    expect(result.offset).toBe(15);
  });

  it("readLog handles missing file", () => {
    const result = reader.readLog("/nonexistent.rpt");
    expect(result.lines).toContain("[文件不存在]");
  });

  it("findActiveRpt returns newest .rpt", () => {
    touch(path.join(tmpDir, "old.rpt"), "old", new Date("2024-01-01"));
    touch(path.join(tmpDir, "new.rpt"), "new", new Date("2025-06-01"));

    const found = reader.findActiveRpt(tmpDir, TEST_UUID);
    expect(found).toBe(path.join(tmpDir, "new.rpt"));
  });

  it("findActiveRpt returns null when no rpt files", () => {
    expect(reader.findActiveRpt(tmpDir, TEST_UUID)).toBeNull();
  });
});
