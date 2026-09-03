import { describe, it, expect } from "vitest";
import { describeNetworkError } from "./proxy-fetch.js";

describe("describeNetworkError", () => {
  it("joins Error.cause and code", () => {
    const cause = new Error("getaddrinfo ENOTFOUND steamcdn-a.akamaihd.net");
    (cause as Error & { code?: string }).code = "ENOTFOUND";
    const err = new Error("fetch failed");
    (err as Error & { cause?: Error }).cause = cause;
    expect(describeNetworkError(err)).toContain("fetch failed");
    expect(describeNetworkError(err)).toContain("ENOTFOUND");
    expect(describeNetworkError(err)).toContain("steamcdn-a.akamaihd.net");
  });
});
