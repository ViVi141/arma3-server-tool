import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { RptLogReader, describeRptSearch } from "./reader.js";

let tmpDir: string;
let reader: RptLogReader;
const TEST_UUID = "00000000-0000-0000-0000-000000000001";
const OTHER_UUID = "00000000-0000-0000-0000-000000000002";

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-rpt-test-"));
  reader = new RptLogReader();
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
function touch(filePath: string, content = "", mtime?: Date): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  if (mtime) fs.utimesSync(filePath, mtime, mtime);
}
function profile(...parts: string[]): string {
  return path.join(tmpDir, "a3st_serverconfig", TEST_UUID, ...parts);
}

describe("RptLogReader", () => {
  it("finds .rpt in the -profiles Users/<uuid> layout", () => {
    const rptPath = profile("Users", TEST_UUID, `${TEST_UUID}.rpt`);
    touch(rptPath, "rpt");
    expect(reader.listLogs(tmpDir, TEST_UUID, "rpt").map((l) => l.filePath)).toEqual([rptPath]);
  });
  it("describeRptSearch only reports instance-owned candidates", () => {
    fs.mkdirSync(profile(), { recursive: true });
    const dirs = describeRptSearch(tmpDir, TEST_UUID);
    expect(dirs.every((d) => d.path.includes(TEST_UUID))).toBe(true);
    expect(dirs.some((d) => d.path.includes("Users"))).toBe(true);
    expect(dirs.every((d) => typeof d.exists === "boolean" && d.note.length > 0)).toBe(true);
    expect(dirs.some((d) => d.exists)).toBe(true);
  });
  it("listLogs returns empty for missing server dir", () => {
    expect(reader.listLogs("/does/not/exist", TEST_UUID, "rpt")).toEqual([]);
  });
  it("listLogs finds .rpt files", () => {
    touch(profile("server_2025.rpt"), "line1\nline2");
    touch(profile("server_2024.rpt"), "old");
    touch(profile("readme.txt"), "not log");
    const logs = reader.listLogs(tmpDir, TEST_UUID, "rpt");
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.fileName.endsWith(".rpt"))).toBe(true);
  });
  it("listLogs filters by kind", () => {
    touch(profile("server.rpt"));
    touch(profile("BattlEye", "battleye.log"));
    expect(reader.listLogs(tmpDir, TEST_UUID, "rpt")).toHaveLength(1);
    expect(reader.listLogs(tmpDir, TEST_UUID, "battleye")).toHaveLength(1);
    expect(reader.listLogs(tmpDir, TEST_UUID, "all")).toHaveLength(2);
  });
  it("listLogs sorts by newest first", () => {
    touch(profile("old.rpt"), "old", new Date("2024-01-01"));
    touch(profile("recent.rpt"), "recent", new Date("2025-01-01"));
    expect(reader.listLogs(tmpDir, TEST_UUID, "rpt")[0].fileName).toBe("recent.rpt");
  });
  it("readLog returns file contents", () => {
    touch(path.join(tmpDir, "test.rpt"), "line1\nline2\nline3");
    const result = reader.readLog(path.join(tmpDir, "test.rpt"));
    expect(result.lines).toEqual(["line1", "line2", "line3"]);
    expect(result.totalLines).toBe(3);
  });
  it("readLog respects maxLines (tail keeps the newest lines)", () => {
    const content = Array.from({ length: 100 }, (_, i) => `line${i + 1}`).join("\n");
    touch(path.join(tmpDir, "big.rpt"), content);
    const result = reader.readLog(path.join(tmpDir, "big.rpt"), 5);
    expect(result.lines).toEqual(["line96", "line97", "line98", "line99", "line100"]);
    expect(result.offset).toBe(Buffer.byteLength(content, "utf8"));
  });
  it("readLog with byte startOffset reads forward incrementally", () => {
    const all = Array.from({ length: 20 }, (_, i) => `line${i + 1}`);
    touch(path.join(tmpDir, "offset.rpt"), all.join("\n"));
    const start = Buffer.byteLength(all.slice(0, 10).join("\n") + "\n", "utf8");
    const result = reader.readLog(path.join(tmpDir, "offset.rpt"), 5, start);
    expect(result.lines).toEqual(["line11", "line12", "line13", "line14", "line15"]);
    expect(result.offset).toBe(start + Buffer.byteLength(all.slice(10, 15).join("\n") + "\n", "utf8"));
  });
  it("readLog handles missing file", () => {
    expect(reader.readLog("/nonexistent.rpt").lines).toContain("[文件不存在]");
  });
  it("findActiveRpt returns newest .rpt", () => {
    touch(profile("old.rpt"), "old", new Date("2024-01-01"));
    touch(profile("new.rpt"), "new", new Date("2025-06-01"));
    expect(reader.findActiveRpt(tmpDir, TEST_UUID)).toBe(profile("new.rpt"));
  });
  it("findActiveRpt returns null when no rpt files", () => {
    expect(reader.findActiveRpt(tmpDir, TEST_UUID)).toBeNull();
  });
  it("listLogs finds rpt under a3st_serverconfig profile dirs", () => {
    touch(profile("arma3server_2026.rpt"), "profile rpt");
    const logs = reader.listLogs(tmpDir, TEST_UUID, "rpt");
    expect(logs).toHaveLength(1);
    expect(logs[0].fileName).toBe("arma3server_2026.rpt");
  });
  it("listLogs finds only this instance service capture log", () => {
    touch(path.join(tmpDir, "logs", `server_${TEST_UUID}.log`), "startup line");
    touch(path.join(tmpDir, "logs", `server_${OTHER_UUID}.log`), "other line");
    const logs = reader.listLogs(tmpDir, TEST_UUID, "console");
    expect(logs).toHaveLength(1);
    expect(logs[0].fileName).toBe(`server_${TEST_UUID}.log`);
    expect(logs[0].kind).toBe("console");
  });
  it("listLogs finds server_console.log under profile as console", () => {
    touch(profile("server_console.log"), "Dedicated host created");
    expect(reader.listLogs(tmpDir, TEST_UUID, "console").map((l) => l.fileName)).toEqual(["server_console.log"]);
  });
  it("resolveAllowedLogPath matches full file path from UI", () => {
    const logPath = path.join(tmpDir, "logs", `server_${TEST_UUID}.log`);
    touch(logPath, "line1");
    expect(reader.resolveAllowedLogPath(tmpDir, TEST_UUID, "console", logPath)).toBe(logPath);
  });
  it("all kind returns both rpt and console", () => {
    touch(profile("server.rpt"), "rpt");
    touch(profile("server_console.log"), "console");
    expect(reader.listLogs(tmpDir, TEST_UUID, "all").map((l) => l.kind).sort()).toEqual(["console", "rpt"]);
  });
  it("共享安装目录、另一实例、HC 与默认文档中的新 RPT 均不能串入本实例", () => {
    const home = path.join(tmpDir, "home");
    vi.stubEnv("USERPROFILE", home);
    vi.stubEnv("HOME", home);
    touch(profile("mine.rpt"), "mine", new Date("2020-01-01"));
    for (const file of [
      path.join(home, "Documents", "Arma 3", "new.rpt"),
      path.join(tmpDir, "shared.rpt"),
      path.join(tmpDir, "a3st_serverconfig", OTHER_UUID, "other.rpt"),
      profile("headless", "hc.rpt"),
    ]) touch(file, "other", new Date("2030-01-01"));
    expect(reader.findActiveRpt(tmpDir, TEST_UUID)).toBe(profile("mine.rpt"));
    expect(reader.listLogs(tmpDir, TEST_UUID, "rpt")).toHaveLength(1);
    expect(reader.resolveAllowedLogPath(tmpDir, TEST_UUID, "rpt", "other.rpt")).toBeNull();
    expect(reader.listLogs(tmpDir, "", "rpt").map((l) => l.fileName)).toEqual(["shared.rpt"]);
  });
});
