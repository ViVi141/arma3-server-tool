import { describe, it, expect } from "vitest";
import { sanitizeSteamCmdOutput } from "./output-sanitize.js";

describe("sanitizeSteamCmdOutput", () => {
  it("removes standard ANSI reset sequences", () => {
    const raw = "\u001B[0mSuccess. Downloaded item 2515887728\n";
    expect(sanitizeSteamCmdOutput(raw)).toBe("Success. Downloaded item 2515887728\n");
  });

  it("removes orphaned SGR sequences when ESC byte is lost", () => {
    const raw = "\uFFFD[0mSuccess. Downloaded item 2447965207\n[0mDownloading item 2262006564 ...\n";
    expect(sanitizeSteamCmdOutput(raw)).toBe(
      "Success. Downloaded item 2447965207\nDownloading item 2262006564 ...\n",
    );
  });

  it("preserves normal steamcmd error lines", () => {
    const raw = "ERROR! Timeout downloading item 583496184\nOK\n";
    expect(sanitizeSteamCmdOutput(raw)).toBe(raw);
  });

  it("strips carriage returns used for progress overwrite", () => {
    const raw = "Downloading item 123 ...\rSuccess.\r\n";
    expect(sanitizeSteamCmdOutput(raw)).toBe("Downloading item 123 ...\nSuccess.\n");
  });
});
