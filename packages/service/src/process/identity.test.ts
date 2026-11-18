import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: mockExecFileSync,
}));

import {
  commandLineContainsNameForTest,
  commandLineContainsPortForTest,
  getProcessCommandLine,
  getProcessExecutablePath,
  isProcessRunning,
  isValidPid,
  killProcessTree,
  verifyProcessIdentity,
} from "./identity.js";

describe("process identity markers", () => {
  it("matches -name=uuid in command line", () => {
    const cmd = `C:\\arma3\\arma3server_x64.exe "-config=..." "-name=abc-uuid" -port=2302`;
    expect(commandLineContainsNameForTest(cmd, "abc-uuid")).toBe(true);
    expect(commandLineContainsNameForTest(cmd, "other-uuid")).toBe(false);
  });

  it("matches -port value", () => {
    const cmd = `arma3server_x64.exe -port=2402 "-name=x"`;
    expect(commandLineContainsPortForTest(cmd, 2402)).toBe(true);
    expect(commandLineContainsPortForTest(cmd, 2302)).toBe(false);
  });
});

describe("SEC-1 strict PID validation and execFileSync", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("isValidPid rejects strings, floats, NaN, Infinity, and <= 0", () => {
    expect(isValidPid(1234)).toBe(true);
    expect(isValidPid("1); Start-Process calc; #")).toBe(false);
    expect(isValidPid("1234")).toBe(false);
    expect(isValidPid(NaN)).toBe(false);
    expect(isValidPid(Infinity)).toBe(false);
    expect(isValidPid(-1)).toBe(false);
    expect(isValidPid(0)).toBe(false);
    expect(isValidPid(1.5)).toBe(false);
    expect(isValidPid(null)).toBe(false);
    expect(isValidPid(undefined)).toBe(false);
  });

  it("never invokes execFileSync for malformed or non-positive PIDs", () => {
    const badPids = [
      "1); Start-Process calc; #" as unknown as number,
      NaN,
      -1,
      0,
      1.5,
      Infinity,
    ];

    for (const bad of badPids) {
      expect(isProcessRunning(bad)).toBe(false);
      expect(getProcessExecutablePath(bad)).toBeNull();
      expect(getProcessCommandLine(bad)).toBeNull();
      expect(verifyProcessIdentity(bad, "C:\\arma3\\arma3server_x64.exe")).toBe("unknown");
      expect(killProcessTree(bad)).toBe(false);
    }

    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("uses execFileSync with exact PID boundary matching and env-var PowerShell on win32", () => {
    Object.defineProperty(process, "platform", { value: "win32" });

    mockExecFileSync.mockReturnValueOnce("arma3server_x64.exe           1234 Console                    1     50,000 K\r\n");
    expect(isProcessRunning(1234)).toBe(true);
    expect(mockExecFileSync).toHaveBeenLastCalledWith(
      "tasklist",
      ["/FI", "PID eq 1234", "/NH"],
      expect.objectContaining({ windowsHide: true })
    );

    // Must not false-match PID 12 against 1234
    mockExecFileSync.mockReturnValueOnce("arma3server_x64.exe           1234 Console                    1     50,000 K\r\n");
    expect(isProcessRunning(12)).toBe(false);

    mockExecFileSync.mockReturnValueOnce("C:\\arma3\\arma3server_x64.exe\r\n");
    expect(getProcessExecutablePath(1234)).toBe("C:\\arma3\\arma3server_x64.exe");
    expect(mockExecFileSync).toHaveBeenLastCalledWith(
      "powershell",
      expect.arrayContaining(["-NoProfile", "-NonInteractive", "-EncodedCommand"]),
      expect.objectContaining({
        env: expect.objectContaining({ A3ST_TARGET_PID: "1234" }),
        windowsHide: true,
      })
    );

    mockExecFileSync.mockReturnValueOnce("arma3server_x64.exe -port=2302\r\n");
    expect(getProcessCommandLine(1234)).toBe("arma3server_x64.exe -port=2302");

    mockExecFileSync.mockReturnValueOnce(undefined);
    expect(killProcessTree(1234)).toBe(true);
    expect(mockExecFileSync).toHaveBeenLastCalledWith(
      "taskkill",
      ["/PID", "1234", "/T", "/F"],
      expect.objectContaining({ windowsHide: true })
    );
  });
});
