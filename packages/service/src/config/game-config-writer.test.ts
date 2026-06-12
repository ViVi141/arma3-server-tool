import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  writeAll,
  serverCfgExists,
  serverCfgPath,
  buildStartCommandLine,
  buildHeadlessClientCommandLine,
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

  it("builds start command line with config paths and mod flags", () => {
    const serverDir = path.join(tmpDir, "server");
    const clientModDir = path.join(serverDir, "client");
    const serverModDir = path.join(serverDir, "servermod");
    fs.mkdirSync(path.join(clientModDir, "addons"), { recursive: true });
    fs.mkdirSync(path.join(serverModDir, "addons"), { recursive: true });

    const cfg: ServerConfigPackage = {
      ...sampleConfig(),
      server: { serverDir, executable: "arma3server_x64.exe" },
      startup: {
        port: 2402,
        enableHT: true,
        limitFps: 60,
        dlcWs: true,
        dlcContact: true,
      },
    };

    const mods = [{
      workshopId: 1,
      name: "Client",
      dirName: "client",
      path: clientModDir,
      enabled: true,
      isServerMod: false,
      isClientMod: true,
      isHcMod: false,
      isLocalMod: false,
      inputLocalMod: false,
      scanOrder: 0,
    }, {
      workshopId: 2,
      name: "Server",
      dirName: "servermod",
      path: serverModDir,
      enabled: true,
      isServerMod: true,
      isClientMod: false,
      isHcMod: false,
      isLocalMod: false,
      inputLocalMod: false,
      scanOrder: 1,
    }];

    const cmd = buildStartCommandLine("uuid-1", cfg, mods);
    expect(cmd).toContain("-port=2402");
    expect(cmd).toContain("a3st_serverconfig");
    expect(cmd).toContain("-mod=");
    expect(cmd).toContain("-serverMod=");
    expect(cmd).toContain("WS;");
    expect(cmd).toContain("contact;");
    expect(cmd).toContain("@client");
    expect(cmd).toContain("@servermod");
    expect(splitCommandLine(cmd).length).toBeGreaterThan(3);
  });

  it("writes motd array with Arma-compatible syntax", () => {
    const cfg: ServerConfigPackage = {
      ...sampleConfig(),
      basic: {
        ...sampleConfig().basic,
        motd: ["Welcome", "Have fun"],
      },
    };
    writeAll("uuid-1", cfg);
    const serverCfg = fs.readFileSync(serverCfgPath(tmpDir, "uuid-1"), "utf-8");
    expect(serverCfg).toContain("motd[]={");
    expect(serverCfg).toContain('"Welcome"');
    expect(serverCfg).not.toContain("motd[]{");
  });

  it("writes mission whitelist and params", () => {
    const cfg: ServerConfigPackage = {
      ...sampleConfig(),
      tasks: {
        missions: [
          { template: "Altis_Conflict", difficulty: 1, whiteList: true },
          { template: "Other_Mission", difficulty: 2, whiteList: false },
        ],
        autoSelectMission: true,
      },
      missionParams: {
        params: { TimeOfDay: "12" },
      },
    };
    writeAll("uuid-1", cfg);
    const serverCfg = fs.readFileSync(serverCfgPath(tmpDir, "uuid-1"), "utf-8");
    expect(serverCfg).toContain("missionWhitelist[]");
    expect(serverCfg).toContain("Altis_Conflict");
    expect(serverCfg).toContain("class Params");
    expect(serverCfg).toContain("TimeOfDay = 12;");
    expect(serverCfg).toContain("autoSelectMission=1;");
  });

  it("appends base64 startConfigArgs and rejects long command lines", () => {
    const encoded = Buffer.from("-customFlag=1", "utf-8").toString("base64");
    const cfg: ServerConfigPackage = {
      ...sampleConfig(),
      startup: {
        port: 2402,
        startConfigArgs: encoded,
      },
    };
    const cmd = buildStartCommandLine("uuid-1", cfg);
    expect(cmd).toContain("-customFlag=1");

    const longModPath = "X".repeat(9000);
    const longCmd = buildStartCommandLine("uuid-1", cfg, [{
      workshopId: 1,
      name: "Huge",
      dirName: "huge",
      path: longModPath,
      enabled: true,
      isServerMod: false,
      isClientMod: true,
      isHcMod: false,
      isLocalMod: false,
      inputLocalMod: false,
      scanOrder: 0,
    }]);
    expect(longCmd.length).toBeGreaterThan(8191);
  });

  it("builds headless client command line with hc mods", () => {
    const serverDir = path.join(tmpDir, "server");
    const hcModDir = path.join(serverDir, "hcmod");
    fs.mkdirSync(path.join(hcModDir, "addons"), { recursive: true });

    const cfg: ServerConfigPackage = {
      ...sampleConfig(),
      server: { serverDir, executable: "arma3server_x64.exe" },
      startup: { port: 2302 },
    };
    const mods = [{
      workshopId: 1,
      name: "HC",
      dirName: "hcmod",
      path: hcModDir,
      enabled: true,
      isServerMod: false,
      isClientMod: false,
      isHcMod: true,
      isLocalMod: false,
      inputLocalMod: false,
      scanOrder: 0,
    }];

    const cmd = buildHeadlessClientCommandLine("uuid-1", cfg, mods);
    expect(cmd).toContain("-client");
    expect(cmd).toContain("-connect=127.0.0.1:2302");
    expect(cmd).toContain("-prot=");
    expect(cmd).toContain("-noPause");
    expect(cmd).toContain("-noSound");
    expect(cmd).toContain("@hcmod");
  });
});
