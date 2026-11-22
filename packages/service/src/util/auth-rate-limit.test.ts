import { describe, it, expect } from "vitest";
import { AuthFailureLimiter } from "./auth-rate-limit.js";

describe("AuthFailureLimiter", () => {
  it("blocks after max failures within the window", () => {
    const limiter = new AuthFailureLimiter(3, 60_000);
    expect(limiter.shouldBlock("1.1.1.1")).toBe(false);
    limiter.recordFailure("1.1.1.1");
    limiter.recordFailure("1.1.1.1");
    expect(limiter.shouldBlock("1.1.1.1")).toBe(false);
    limiter.recordFailure("1.1.1.1");
    expect(limiter.shouldBlock("1.1.1.1")).toBe(true);
  });

  it("clears the budget after a successful auth", () => {
    const limiter = new AuthFailureLimiter(1, 60_000);
    limiter.recordFailure("2.2.2.2");
    expect(limiter.shouldBlock("2.2.2.2")).toBe(true);
    limiter.clear("2.2.2.2");
    expect(limiter.shouldBlock("2.2.2.2")).toBe(false);
  });

  it("isolates budgets per IP", () => {
    const limiter = new AuthFailureLimiter(1, 60_000);
    limiter.recordFailure("a");
    expect(limiter.shouldBlock("a")).toBe(true);
    expect(limiter.shouldBlock("b")).toBe(false);
  });
});
