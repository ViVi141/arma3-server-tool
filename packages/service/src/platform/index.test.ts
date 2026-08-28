import { describe, it, expect } from "vitest";
import {
  defaultServerExecutable,
  steamCmdEntryName,
  steamCmdDownloadUrl,
  STEAMCMD_LINUX_URL,
  STEAMCMD_WIN_URL,
} from "./index.js";
import { splitCommandLine } from "./argv.js";

describe("platform", () => {
  it("splitCommandLine handles quoted paths", () => {
    const parts = splitCommandLine('+force_install_dir "/opt/arma 3" +quit');
    expect(parts).toEqual(['+force_install_dir', '/opt/arma 3', '+quit']);
  });

  it("exposes OS-specific SteamCMD URL", () => {
    if (process.platform === "linux") {
      expect(steamCmdDownloadUrl()).toBe(STEAMCMD_LINUX_URL);
      expect(steamCmdEntryName()).toBe("steamcmd.sh");
      expect(defaultServerExecutable()).toBe("arma3server");
    } else {
      expect(steamCmdDownloadUrl()).toBe(STEAMCMD_WIN_URL);
      expect(steamCmdEntryName()).toBe("steamcmd.exe");
      expect(defaultServerExecutable()).toBe("arma3server_x64.exe");
    }
  });
});
