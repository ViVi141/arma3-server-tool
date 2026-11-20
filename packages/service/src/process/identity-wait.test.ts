import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { waitForProcessExit, getProcessSessionIdentity, stopProcessSession } from "./identity.js";

describe("waitForProcessExit", () => {
  it("真实本机进程启动身份稳定，非法 PID 不查询", async () => {
    const first = await getProcessSessionIdentity(process.pid);
    expect(first).toBeTypeOf("string");
    expect(await getProcessSessionIdentity(process.pid)).toBe(first);
    expect(await getProcessSessionIdentity(0)).toBeNull();
    expect(await getProcessSessionIdentity(-1)).toBeNull();
  });
  it("维护停止只作用于登记的启动会话，真实临时 Node 进程核验错误身份不杀、正确身份退出", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
    const exited = once(child, "exit");
    try {
      await once(child, "spawn");
      const identity = await getProcessSessionIdentity(child.pid!);
      expect(identity).toBeTypeOf("string");
      await expect(stopProcessSession(child.pid!, "wrong-session", process.execPath)).rejects.toThrow();
      expect(await getProcessSessionIdentity(child.pid!)).toBe(identity);
      await expect(stopProcessSession(child.pid!, identity!, process.execPath + ".different")).rejects.toThrow();
      expect(await getProcessSessionIdentity(child.pid!)).toBe(identity);
      await stopProcessSession(child.pid!, identity!, process.execPath);
      await exited;
      expect(await getProcessSessionIdentity(child.pid!)).toBeNull();
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); await exited; }
  }, 30000);
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
