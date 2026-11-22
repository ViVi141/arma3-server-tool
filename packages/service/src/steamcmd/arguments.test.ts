import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  buildDedicatedServerUpdateArguments,
  buildWorkshopDownloadArguments,
  countDistinctModIds,
  quoteSteamCmdArgument,
  redactPasswordInArguments,
  redactSteamCmdConsoleChunk,
} from "./arguments.js";
import { normalizeWorkshopRoot } from "./path-helper.js";

describe("quoteSteamCmdArgument", () => {
  it("matches C# null handling", () => {
    expect(quoteSteamCmdArgument(null)).toBe("\"\"");
    expect(quoteSteamCmdArgument(undefined)).toBe("\"\"");
  });

  it("matches C# escape rules", () => {
    expect(quoteSteamCmdArgument("user name")).toBe("\"user name\"");
    expect(quoteSteamCmdArgument("pa\"ss\\word")).toBe("\"pa\\\"ss\\\\word\"");
  });
});

describe("buildWorkshopDownloadArguments", () => {
  it("matches C# DownloadWorkshopItems_WithSteamCmd_StartsProcess", () => {
    const workshopRoot = path.join("C:", "workshop");
    const args = buildWorkshopDownloadArguments("user", "pass", workshopRoot, [
      111111111, 222222222,
    ]);
    expect(args).toContain(`+force_install_dir "${workshopRoot}"`);
    expect(args).toContain("+login \"user\" \"pass\"");
    expect(args).toContain("workshop_download_item 107410 111111111");
    expect(args).toContain("workshop_download_item 107410 222222222");
    expect(args.endsWith("+quit")).toBe(true);
  });

  it("matches C# DownloadWorkshopItems_WithQuotedCredentials_EscapesArguments", () => {
    const workshopRoot = path.join("C:", "workshop");
    const args = buildWorkshopDownloadArguments("user name", "pa\"ss\\word", workshopRoot, [
      111111111,
    ]);
    expect(args).toContain("+login \"user name\" \"pa\\\"ss\\\\word\"");
  });

  it("deduplicates mod ids and skips zero like C#", () => {
    const workshopRoot = path.join("D:", "SteamCMD");
    const args = buildWorkshopDownloadArguments("user", "pass", workshopRoot, [
      111, 111, 0, 222,
    ]);
    expect(args).toBe(
      `+force_install_dir "${workshopRoot}" +login "user" "pass" +workshop_download_item 107410 111 +workshop_download_item 107410 222 +quit`,
    );
    expect(countDistinctModIds([111, 111, 0, 222])).toBe(2);
  });
});

describe("buildDedicatedServerUpdateArguments", () => {
  it("uses platform-specific app_update flags", () => {
    const args = buildDedicatedServerUpdateArguments("user", "pass", "/opt/arma3");
    expect(args).toContain('+force_install_dir "/opt/arma3"');
    expect(args).toContain('+login "user" "pass"');
    if (process.platform === "linux") {
      expect(args).toContain("+app_update 233780 validate");
      expect(args).not.toContain("creatordlc");
    } else {
      expect(args).toContain("-beta creatordlc validate");
    }
    expect(args.endsWith("+quit")).toBe(true);
  });
});

describe("normalizeWorkshopRoot", () => {
  it("falls back to extension directory when empty", () => {
    const userData = path.join("C:", "data");
    const normalized = normalizeWorkshopRoot(
      { applicationBase: userData, userDataDirectory: userData },
      "",
    );
    expect(normalized).toBe(path.join(userData, "extension"));
  });
});

describe("SEC-2 password redaction in arguments and console chunks", () => {
  it("redacts quoted and escaped passwords with quotes and backslashes", () => {
    const pw = 'pa"ss\\word!123';
    const args = buildWorkshopDownloadArguments("builder", pw, "C:\\ws", [450814997]);
    const redacted = redactPasswordInArguments(args, pw);
    expect(redacted).not.toContain(pw);
    expect(redacted).not.toContain('pa\\"ss\\\\word!123');
    expect(redacted).toContain('+login "builder" "***"');
  });

  it("keeps cached +login <user> +quit intact without redacting +quit", () => {
    const args = buildWorkshopDownloadArguments("builder", "ignored", "C:\\ws", [450814997], {
      loginMode: "cached",
    });
    const redacted = redactPasswordInArguments(args, "ignored");
    expect(redacted).toContain('+login "builder" +workshop_download_item');
    const cachedOnly = '+force_install_dir "C:\\ws" +login "builder" +quit';
    expect(redactPasswordInArguments(cachedOnly, "")).toBe(cachedOnly);
  });

  it("redacts +login password tokens even when password is unknown and scrubs debug lines", () => {
    const line = '[调试] ProcessStartInfo.Arguments: +login "builder" "SuperSecret!99" +quit\n';
    expect(redactSteamCmdConsoleChunk('login "ab"', "ab")).toBe('login "***"');
    const clean = redactSteamCmdConsoleChunk(line, "SuperSecret!99");
    expect(clean).not.toContain("SuperSecret!99");
    expect(clean).toContain('+login "builder" "***" +quit');

    const fallbackClean = redactSteamCmdConsoleChunk(
      '[调试] ProcessStartInfo.Arguments: +login "builder" "UnknownSecret" +quit\n'
    );
    expect(fallbackClean).not.toContain("UnknownSecret");
    expect(fallbackClean).toContain('+login "builder" "***" +quit');
  });
});
