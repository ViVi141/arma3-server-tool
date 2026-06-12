import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  buildWorkshopDownloadArguments,
  countDistinctModIds,
  quoteSteamCmdArgument,
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
