import { describe, it, expect } from "vitest";
import { readLocalUpdatedAtMs, resolveUpdateStatus } from "./workshop-update.js";

describe("workshop-update", () => {
  it("returns missing when no local path", () => {
    expect(resolveUpdateStatus(1700000000, undefined, false)).toBe("missing");
  });

  it("reads ISO updatedAt from local ref", () => {
    const ms = readLocalUpdatedAtMs({
      modId: 1,
      path: "",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(ms).toBe(Date.parse("2026-01-01T00:00:00.000Z"));
  });
});
