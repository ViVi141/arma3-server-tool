import { describe, it, expect } from "vitest";
import { runPreflightChecks } from "./checker.js";
import type { ServerConfigPackage } from "../types/config.js";

describe("runPreflightChecks", () => {
  it("reports missing server directory as error", () => {
    const result = runPreflightChecks("uuid-1", {
      formatVersion: 2,
      server: { executable: "arma3server_x64.exe" },
    });
    expect(result.hasBlockingErrors).toBe(true);
    expect(result.issues.some((i) => i.category === "目录")).toBe(true);
  });

  it("warns when rcon password missing", () => {
    const result = runPreflightChecks("uuid-1", {
      formatVersion: 2,
      server: { serverDir: "C:\\missing", executable: "arma3server_x64.exe" },
      startup: { port: 2302 },
    });
    expect(result.issues.some((i) => i.category === "RCon")).toBe(true);
  });
});
