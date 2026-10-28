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

  it("readLog respects maxLines (tail keeps the newest lines)", () => {
    const all = Array.from({ length: 100 }, (_, i) => `line${i + 1}`);
    const content = all.join("\n");
    touch(path.join(tmpDir, "big.rpt"), content);
    const result = reader.readLog(path.join(tmpDir, "big.rpt"), 5);
    expect(result.lines).toEqual(["line96", "line97", "line98", "line99", "line100"]);
    // Tail reads report the byte size so a follow-up read can continue forward.
    expect(result.offset).toBe(Buffer.byteLength(content, "utf8"));
  });

  it("readLog with byte startOffset reads forward incrementally", () => {
    const all = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    const content = all.join("\n");
    touch(path.join(tmpDir, "offset.rpt"), content);
    const start = Buffer.byteLength(all.slice(0, 10).join("\n") + "\n", "utf8");
    const result = reader.readLog(path.join(tmpDir, "offset.rpt"), 5, start);
    expect(result.lines).toEqual(["line11", "line12", "line13", "line14", "line15"]);
    const consumed = Buffer.byteLength(all.slice(10, 15).join("\n") + "\n", "utf8");
    expect(result.offset).toBe(start + consumed);
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

  it("listLogs finds rpt under a3st_serverconfig profile dirs", () => {
    const profileRoot = path.join(tmpDir, "a3st_serverconfig", TEST_UUID);
    touch(path.join(profileRoot, "arma3server_2026.rpt"), "profile rpt");

    const logs = reader.listLogs(tmpDir, TEST_UUID, "rpt");
    expect(logs).toHaveLength(1);
    expect(logs[0].fileName).toBe("arma3server_2026.rpt");
  });

  it("listLogs finds service capture log under logs/ as console", () => {
    touch(path.join(tmpDir, "logs", `server_${TEST_UUID}.log`), "startup line");

    const logs = reader.listLogs(tmpDir, TEST_UUID, "console");
    expect(logs).toHaveLength(1);
    expect(logs[0].fileName).toBe(`server_${TEST_UUID}.log`);
    expect(logs[0].kind).toBe("console");
  });

  it("listLogs finds server_console.log under profile as console", () => {
    const profileRoot = path.join(tmpDir, "a3st_serverconfig", TEST_UUID);
    touch(path.join(profileRoot, "server_console.log"), "Dedicated host created");

    const logs = reader.listLogs(tmpDir, TEST_UUID, "console");
    expect(logs).toHaveLength(1);
    expect(logs[0].fileName).toBe("server_console.log");
    expect(logs[0].kind).toBe("console");
  });

  it("resolveAllowedLogPath matches full file path from UI", () => {
    const logPath = path.join(tmpDir, "logs", `server_${TEST_UUID}.log`);
    touch(logPath, "line1");

    const resolved = reader.resolveAllowedLogPath(tmpDir, TEST_UUID, "console", logPath);
    expect(resolved).toBe(logPath);
  });

  it("all kind returns both rpt and console", () => {
    const profileRoot = path.join(tmpDir, "a3st_serverconfig", TEST_UUID);
    touch(path.join(profileRoot, "server.rpt"), "rpt");
    touch(path.join(profileRoot, "server_console.log"), "console");

    const logs = reader.listLogs(tmpDir, TEST_UUID, "all");
    expect(logs.map((l) => l.kind).sort()).toEqual(["console", "rpt"]);
  });
});
