import { describe, it, expect } from "vitest";
import * as path from "node:path";
import {
  assertMissionPboFileName,
  assertSafeTargetPath,
  sanitizeUploadFileName,
} from "./upload-safety.js";

describe("sanitizeUploadFileName", () => {
  it("strips directories", () => {
    expect(sanitizeUploadFileName("../evil.pbo")).toBe("evil.pbo");
    expect(sanitizeUploadFileName("a/b/c.pbo")).toBe("c.pbo");
  });

  it("rejects empty and traversal-only", () => {
    expect(() => sanitizeUploadFileName("..")).toThrow();
    expect(() => sanitizeUploadFileName("")).toThrow();
  });
});

describe("assertSafeTargetPath", () => {
  it("keeps files inside target dir", () => {
    const dir = path.join("C:", "servers", "arma", "MPMissions");
    const full = assertSafeTargetPath(dir, "mission.pbo");
    expect(full.toLowerCase()).toContain("mpmissions");
    expect(full.endsWith("mission.pbo")).toBe(true);
  });
});

describe("assertMissionPboFileName", () => {
  it("requires .pbo", () => {
    expect(assertMissionPboFileName("x.pbo")).toBe("x.pbo");
    expect(() => assertMissionPboFileName("x.zip")).toThrow(/pbo/i);
  });
});
