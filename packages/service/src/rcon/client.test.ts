import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

const { mockCreateSocket, mockSocketHolder } = vi.hoisted(() => ({
  mockCreateSocket: vi.fn(),
  mockSocketHolder: {
    current: null as (EventEmitter & {
      send: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    }) | null,
  },
}));

vi.mock("node:dgram", () => ({
  createSocket: mockCreateSocket,
}));

import { RconClient } from "./client.js";

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildBePacket(payload: number[]): Buffer {
  const crc = crc32(new Uint8Array(payload));
  const out = Buffer.alloc(6 + payload.length);
  out[0] = 0x42; // 'B'
  out[1] = 0x45; // 'E'
  out.writeUInt32LE(crc, 2);
  for (let i = 0; i < payload.length; i++) {
    out[6 + i] = payload[i];
  }
  return out;
}

function buildLoginResponse(ok: boolean): Buffer {
  return buildBePacket([0xff, 0x00, ok ? 1 : 0]);
}

function buildFragmentedResponse(seq: number, fragCount: number, fragIndex: number, text: string): Buffer {
  const body = Buffer.from(text, "utf8");
  return buildBePacket([0xff, 0x01, seq & 0xff, 0x00, fragCount & 0xff, fragIndex & 0xff, ...body]);
}

function buildSingleResponse(seq: number, text: string): Buffer {
  const body = Buffer.from(text, "utf8");
  return buildBePacket([0xff, 0x01, seq & 0xff, ...body]);
}

describe("BUG-4 RconClient fragment overwrite and timer cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCreateSocket.mockReset();
    mockCreateSocket.mockImplementation(() => {
      const sock = new EventEmitter() as EventEmitter & {
        send: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
      };
      sock.send = vi.fn();
      sock.close = vi.fn();
      mockSocketHolder.current = sock;
      return sock;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("overwrites duplicate UDP fragments by index instead of concatenating", async () => {
    const client = new RconClient({
      host: "127.0.0.1",
      port: 2302,
      password: "pass",
      timeout: 5000,
      retryIntervalMs: 1000,
    });

    const connectPromise = client.connect();
    const sock = mockSocketHolder.current!;
    sock.emit("message", buildLoginResponse(true));
    await connectPromise;

    const cmdPromise = client.sendCommand("players");
    // seq starts at 0 and nextSeq() increments to 1
    sock.emit("message", buildFragmentedResponse(1, 2, 0, "PartA"));
    // Retransmitted duplicate fragment 0/2
    sock.emit("message", buildFragmentedResponse(1, 2, 0, "PartA"));
    sock.emit("message", buildFragmentedResponse(1, 2, 1, "PartB"));

    const resp = await cmdPromise;
    expect(resp.success).toBe(true);
    expect(resp.message).toBe("PartAPartB");

    // Also test single-packet response
    const singlePromise = client.sendCommand("status");
    sock.emit("message", buildSingleResponse(2, "SingleOk"));
    const singleResp = await singlePromise;
    expect(singleResp.message).toBe("SingleOk");

    client.disconnect();
  });

  it("clears failTimer and retryTimer on socket error and emits disconnected once", async () => {
    const client = new RconClient({
      host: "127.0.0.1",
      port: 2302,
      password: "pass",
      timeout: 5000,
      retryIntervalMs: 1000,
    });

    const disconnectedSpy = vi.fn();
    client.on("disconnected", disconnectedSpy);

    const connectPromise = client.connect();
    const sock = mockSocketHolder.current!;
    expect(sock.send).toHaveBeenCalledTimes(1);

    sock.emit("error", new Error("ECONNREFUSED"));
    await expect(connectPromise).rejects.toThrow("ECONNREFUSED");
    expect(disconnectedSpy).toHaveBeenCalledTimes(1);

    // Advance timers past timeout and retry intervals: no extra sends or disconnected events
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sock.send).toHaveBeenCalledTimes(1);
    expect(disconnectedSpy).toHaveBeenCalledTimes(1);

    // Calling disconnect() again when already disconnected does not re-emit
    client.disconnect();
    expect(disconnectedSpy).toHaveBeenCalledTimes(1);
  });
});
