import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: mockExecFileSync,
}));

import { isPortInUse, pickHeadlessProtPort } from "./game-config-writer.js";

function udpTable(ports: number[]): string {
  return ports
    .map((port) => `  UDP    0.0.0.0:${port}        *:*    1234`)
    .join("\r\n");
}

beforeEach(() => {
  mockExecFileSync.mockReset();
});

describe("UDP port probing", () => {
  it("parses all ports with a single command invocation", () => {
    mockExecFileSync.mockReturnValue(udpTable([2302, 2402]));

    expect(isPortInUse(2302)).toBe(true);
    expect(isPortInUse(2303)).toBe(false);
    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
  });

  it("picks the first free port after the server port, skipping busy ones", () => {
    mockExecFileSync.mockReturnValue(udpTable([2303, 2304]));
    expect(pickHeadlessProtPort(2302)).toBe(2305);
  });

  it("returns 0 instead of a known-busy port when the scan is exhausted", () => {
    const used = Array.from({ length: 100 }, (_, index) => 2303 + index);
    mockExecFileSync.mockReturnValue(udpTable(used));
    expect(pickHeadlessProtPort(2302)).toBe(0);
  });

  it("falls back to the 2302 base for invalid server ports", () => {
    mockExecFileSync.mockReturnValue(udpTable([]));
    expect(pickHeadlessProtPort(0)).toBe(2303);
    expect(pickHeadlessProtPort(70000)).toBe(2303);
  });
});
