import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expandUserPath, resolveConfiguredPath } from "./user-path.js";

describe("user-path", () => {
  it("expands tilde to home directory", () => {
    expect(expandUserPath("~")).toBe(os.homedir());
  });

  it("expands tilde-prefixed relative paths", () => {
    const home = os.homedir();
    const root = fs.mkdtempSync(path.join(home, "a3st-user-path-"));
    try {
      const nested = path.join(root, ".local", "share", "Steam", "steamapps", "workshop", "content", "107410");
      fs.mkdirSync(nested, { recursive: true });
      const relativeFromHome = path.relative(home, nested).split(path.sep).join("/");
      const tildePath = "~/" + relativeFromHome;

      expect(resolveConfiguredPath(tildePath)).toBe(nested);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
