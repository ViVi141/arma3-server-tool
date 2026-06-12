import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  writeAll,
  serverCfgExists,
  serverCfgPath,
  buildStartCommandLine,
  splitCommandLine,
  getConfigRoot,
} from "./game-config-writer.js";
import type { ServerConfigPackage } from "../types/config.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-writer-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("GameConfigWriter", () => {
  const sampleConfig = (): ServerConfigPackage => ({
    formatVersion: 2,
    server: {
      serverDir: tmpDir,
      executable: "arma3server_x64.exe",
    },
    basic: {
      hostname: "Test Server",
      maxPlayers: 32,
      passwordAdmin: "admin",
      port: 2402,
    },
    startup: {
      port: 2402,
      enableHT: true,
      limitFps: 60,
    },
    battleye: {
      rconPort: 2402,
      rconPassword: "secret",
    },
    tasks: {
      missions: [{ template: "Altis_Conflict", difficulty: 1 }],
    },
  });

  it("writes cfg files under a3st_serverconfig/{uuid}", () => {
    const result = writeAll("uuid-1", sampleConfig());
    expect(result.success).toBe(true);
    expect(serverCfgExists(tmpDir, "uuid-1")).toBe(true);

    const serverCfg = fs.readFileSync(serverCfgPath(tmpDir, "uuid-1"), "utf-8");
    expect(serverCfg).toContain('hostname="Test Server"');
    expect(serverCfg).toContain("maxPlayers=32;");
    expect(serverCfg).toContain("class Missions");

    const basicCfg = fs.readFileSync(path.join(getConfigRoot(tmpDir, "uuid-1"), "basic.cfg"), "utf-8");
    expect(basicCfg).toContain("MaxMsgSend=128;");

    const profile = fs.readFileSync(
      path.join(getConfigRoot(tmpDir, "uuid-1"), "Users", "uuid-1", "uuid-1.Arma3Profile"),
      "utf-8"
    );
    expect(profile).toContain("CustomDifficulty");

    const beCfg = fs.readFileSync(
      path.join(getConfigRoot(tmpDir, "uuid-1"), "BattlEye", "BEServer_x64.cfg"),
      "utf-8"
    );
    expect(beCfg).toContain("RConPassword secret");
  });

  it("builds start command line with config paths", () => {
    const cmd = buildStartCommandLine("uuid-1", sampleConfig());
    expect(cmd).toContain("-port=2402");
    expect(cmd).toContain("a3st_serverconfig");
    expect(cmd).toContain("server.cfg");
    expect(cmd).toContain("basic.cfg");
    expect(splitCommandLine(cmd).length).toBeGreaterThan(3);
  });
});
