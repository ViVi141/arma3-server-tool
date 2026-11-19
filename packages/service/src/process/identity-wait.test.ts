import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { waitForProcessExit } from "./identity.js";

describe("waitForProcessExit", () => {
  it("returns true immediately for invalid PIDs", async () => {
    expect(await waitForProcessExit(0, 100)).toBe(true);
    expect(await waitForProcessExit(-5, 100)).toBe(true);
  });

  it("returns true once a short-lived child exits", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 300)"], {
      stdio: "ignore",
    });
    try {
      expect(child.pid).toBeTypeOf("number");
      expect(await waitForProcessExit(child.pid!, 10000, 100)).toBe(true);
    } finally {
      child.kill();
    }
  });

  it("returns false while the process is still alive past the timeout", async () => {
    // 当前测试进程必定存活，避免依赖外部进程。
    expect(await waitForProcessExit(process.pid, 300, 100)).toBe(false);
  });
});
