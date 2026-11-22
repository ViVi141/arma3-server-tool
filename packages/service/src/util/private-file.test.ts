import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PRIVATE_FILE_MODE, writePrivateJsonFile, writePrivateTextFile } from "./private-file.js";

describe("writePrivateTextFile", () => {
  let tmpDir = "";

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-private-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes content and applies owner-only mode when the platform supports it", () => {
    const filePath = path.join(tmpDir, "secret.txt");
    writePrivateTextFile(filePath, "rcon-password\n");
    expect(fs.readFileSync(filePath, "utf-8")).toBe("rcon-password\n");
    if (process.platform !== "win32") {
      expect(fs.statSync(filePath).mode & 0o777).toBe(PRIVATE_FILE_MODE);
    }
  });

  it("writes JSON atomically", () => {
    const filePath = path.join(tmpDir, "settings.json");
    writePrivateJsonFile(filePath, { password: "x" });
    expect(JSON.parse(fs.readFileSync(filePath, "utf-8"))).toEqual({ password: "x" });
  });
});
