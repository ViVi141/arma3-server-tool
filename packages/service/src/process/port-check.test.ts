import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecFileSync, mockExecFile, mockIsWindows, mockReadFileSync, mockReadFile } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
  mockExecFile: vi.fn(),
  mockIsWindows: vi.fn(() => false),
  mockReadFileSync: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: mockExecFileSync,
  execFile: mockExecFile,
}));

vi.mock("../platform/index.js", () => ({
  isWindows: mockIsWindows,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: mockReadFileSync,
    promises: {
      ...actual.promises,
      readFile: mockReadFile,
    },
  };
});

import {
  isPortListening,
  isPortListeningAsync,
  isValidPort,
  parseProcNetUdp,
  waitForPortReady,
} from "./port-check.js";

const PROC_NET_UDP_SAMPLE = [
  "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode ref pointer drops",
  "  12: 00000000:08FE 00000000:0000 07 00000000:00000000 00:00000000 00000000  1000        0 12345 2 00000000 0",
  "  13: 00000000:0962 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 12346 2 00000000 0",
].join("\n");

describe("BUG-1 UDP readiness probe (port-check)", () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockExecFile.mockReset();
    mockIsWindows.mockReset();
    mockIsWindows.mockReturnValue(false);
    mockReadFileSync.mockReset();
    mockReadFile.mockReset();
  });

  it("parseProcNetUdp matches UDP bound (07) and connected (01) sockets by hex port", () => {
    // 2302 === 0x08FE
    expect(parseProcNetUdp(PROC_NET_UDP_SAMPLE, 2302)).toBe(true);
    // 2402 === 0x0962 has state 0A (not UDP bound/connected)
    expect(parseProcNetUdp(PROC_NET_UDP_SAMPLE, 2402)).toBe(false);

    const ipv6Sample = [
      "  sl  local_address                         remote_address                        st",
      "   1: 00000000000000000000000000000000:08FF 00000000000000000000000000000000:0000 01",
    ].join("\n");
    expect(parseProcNetUdp(ipv6Sample, 2303)).toBe(true);
  });

  it("rejects invalid port numbers without calling OS probes", () => {
    for (const bad of [0, -1, NaN, 1.5, 65536]) {
      expect(isValidPort(bad)).toBe(false);
      expect(isPortListening(bad)).toBe(false);
    }
    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  it("reads /proc/net/udp and /proc/net/udp6 on Linux", async () => {
    mockIsWindows.mockReturnValue(false);
    mockReadFileSync.mockImplementation((file: unknown) => {
      if (file === "/proc/net/udp") return PROC_NET_UDP_SAMPLE;
      throw new Error("ENOENT");
    });
    expect(isPortListening(2302)).toBe(true);
    expect(isPortListening(2402)).toBe(false);

    mockReadFile.mockImplementation(async (file: unknown) => {
      if (file === "/proc/net/udp6") {
        return "  sl local rem st\n 0: 0000:0900 0000:0000 07\n";
      }
      throw new Error("ENOENT");
    });
    expect(await isPortListeningAsync(2304)).toBe(true);
  });

  it("uses Get-NetUDPEndpoint with A3ST_PROBE_PORT env var on Windows", async () => {
    mockIsWindows.mockReturnValue(true);
    mockExecFileSync.mockReturnValueOnce("2302\r\n");

    expect(isPortListening(2302)).toBe(true);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      "powershell",
      expect.arrayContaining(["-NoProfile", "-NonInteractive", "-Command"]),
      expect.objectContaining({
        env: expect.objectContaining({ A3ST_PROBE_PORT: "2302" }),
        windowsHide: true,
      })
    );
    const cmdArg = (mockExecFileSync.mock.calls[0][1] as string[]).join(" ");
    expect(cmdArg).toContain("Get-NetUDPEndpoint");
    expect(cmdArg).not.toContain("Get-NetTCPConnection");
  });

  it("waitForPortReady resolves ready quickly, exited when dead, timeout when expired or port<=0", async () => {
    let polls = 0;
    const t0 = Date.now();
    const readyRes = await waitForPortReady(2302, 5000, () => true, 10, async () => {
      polls += 1;
      return polls >= 2;
    });
    expect(readyRes).toBe("ready");
    expect(Date.now() - t0).toBeLessThan(500);

    const exitedRes = await waitForPortReady(2302, 5000, () => false, 10, () => false);
    expect(exitedRes).toBe("exited");

    const timeoutRes = await waitForPortReady(2302, 30, () => true, 10, () => false);
    expect(timeoutRes).toBe("timeout");

    const tBad = Date.now();
    const invalidRes = await waitForPortReady(0, 5000, () => true, 10, () => true);
    expect(invalidRes).toBe("timeout");
    expect(Date.now() - tBad).toBeLessThan(100);
  });
});
