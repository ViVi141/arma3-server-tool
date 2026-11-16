import { describe, it, expect } from "vitest";
import { isInQuietHours, parseHhMm } from "./quiet-hours.js";

describe("parseHhMm", () => {
  it("parses valid times", () => {
    expect(parseHhMm("0:00")).toBe(0);
    expect(parseHhMm("18:30")).toBe(18 * 60 + 30);
    expect(parseHhMm("23:59")).toBe(23 * 60 + 59);
  });

  it("rejects invalid", () => {
    expect(parseHhMm("")).toBeNull();
    expect(parseHhMm("25:00")).toBeNull();
    expect(parseHhMm("12:60")).toBeNull();
    expect(parseHhMm("noon")).toBeNull();
  });
});

describe("isInQuietHours", () => {
  it("returns false when window incomplete", () => {
    expect(isInQuietHours("18:00", undefined, new Date(2026, 0, 1, 19, 0))).toBe(false);
    expect(isInQuietHours(undefined, "22:00", new Date(2026, 0, 1, 19, 0))).toBe(false);
  });

  it("handles same-day window", () => {
    const at19 = new Date(2026, 0, 1, 19, 0);
    const at17 = new Date(2026, 0, 1, 17, 0);
    expect(isInQuietHours("18:00", "22:00", at19)).toBe(true);
    expect(isInQuietHours("18:00", "22:00", at17)).toBe(false);
  });

  it("handles overnight window", () => {
    const at23 = new Date(2026, 0, 1, 23, 0);
    const at3 = new Date(2026, 0, 1, 3, 0);
    const at12 = new Date(2026, 0, 1, 12, 0);
    expect(isInQuietHours("22:00", "06:00", at23)).toBe(true);
    expect(isInQuietHours("22:00", "06:00", at3)).toBe(true);
    expect(isInQuietHours("22:00", "06:00", at12)).toBe(false);
  });
});
