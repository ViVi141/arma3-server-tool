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
    vi.restoreAllMocks();
  });

  it("玩家查询超时、截断或未知响应不能返回零人", async () => {
    const client = new RconClient({ host: "127.0.0.1", port: 2302, password: "test" });
    const send = vi.spyOn(client, "sendCommand");
    send.mockResolvedValue({ success: false, message: "Command timeout" });
    await expect(client.getPlayers()).rejects.toThrow("未知");
    send.mockResolvedValue({ success: true, message: "unexpected response" });
    await expect(client.getPlayers()).rejects.toThrow("未知");
    send.mockResolvedValue({ success: true, message: "Players on server:\n(2 players in total)" });
    await expect(client.getPlayers()).rejects.toThrow("不完整");
    send.mockResolvedValue({ success: true, message: "Players on server:\n(0 players in total)" });
    await expect(client.getPlayers()).resolves.toEqual([]);
    send.mockResolvedValue({ success: true, message: "Players on server:\n0 127.0.0.1:2304 42 abcdef1234567890(OK) 玩家 A\n(1 players in total)" });
    await expect(client.getPlayers()).resolves.toEqual([{ num: 0, guid: "abcdef1234567890", name: "玩家 A" }]);
  });

  it("连接中断结束待处理命令而不是永久挂起", async () => {
    const client = new RconClient({ host: "127.0.0.1", port: 2302, password: "test" });
    const connected = client.connect();
    mockSocketHolder.current!.emit("message", buildLoginResponse(true));
    await connected;
    const pending = client.sendCommand("players");
    client.disconnect();
    await expect(pending).resolves.toMatchObject({ success: false });
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
    // First post-login command must use seq 0 (Linux BattlEye ignores seq≠0 first).
    sock.emit("message", buildFragmentedResponse(0, 2, 0, "PartA"));
    // Retransmitted duplicate fragment 0/2
    sock.emit("message", buildFragmentedResponse(0, 2, 0, "PartA"));
    sock.emit("message", buildFragmentedResponse(0, 2, 1, "PartB"));

    const resp = await cmdPromise;
    expect(resp.success).toBe(true);
    expect(resp.message).toBe("PartAPartB");

    // Also test single-packet response
    const singlePromise = client.sendCommand("status");
    sock.emit("message", buildSingleResponse(1, "SingleOk"));
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

  it("shares a single login handshake across concurrent connect() calls", async () => {
    const client = new RconClient({ host: "127.0.0.1", port: 2303, password: "pass" });

    // A second caller must await the in-flight login instead of resolving
    // immediately (which used to make sendCommand() report "Not connected").
    const first = client.connect();
    const second = client.connect();
    const sock = mockSocketHolder.current!;
    expect(mockCreateSocket).toHaveBeenCalledTimes(1);
    expect(sock.send).toHaveBeenCalledTimes(1);

    sock.emit("message", buildLoginResponse(true));
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(client.connected).toBe(true);

    client.disconnect();
  });

  it("resolves in-flight commands when the session is torn down", async () => {
    const client = new RconClient({ host: "127.0.0.1", port: 2303, password: "pass" });
    const connectPromise = client.connect();
    const sock = mockSocketHolder.current!;
    sock.emit("message", buildLoginResponse(true));
    await connectPromise;

    const cmdPromise = client.sendCommand("players");
    client.disconnect();

    // Must resolve (not hang) so callers are not stuck forever.
    await expect(cmdPromise).resolves.toEqual({ success: false, message: "RCon 连接已断开" });
  });

  it("clears connect timers and rejects when disconnected mid-handshake", async () => {
    const client = new RconClient({
      host: "127.0.0.1",
      port: 2305,
      password: "pass",
      timeout: 5000,
      retryIntervalMs: 1000,
    });
    const pending = client.connect();
    const sock = mockSocketHolder.current!;
    expect(sock.send).toHaveBeenCalled();
    client.disconnect();
    await expect(pending).rejects.toThrow("RCon 连接已断开");
    await vi.advanceTimersByTimeAsync(10_000);
    // No further login retransmits after disconnect.
    expect(sock.send.mock.calls.length).toBe(1);
  });

  it("uses sequence 0 for the first command after login", async () => {
    const client = new RconClient({
      host: "127.0.0.1",
      port: 2305,
      password: "pass",
      timeout: 5000,
      retryIntervalMs: 1000,
    });
    const connectPromise = client.connect();
    const sock = mockSocketHolder.current!;
    sock.emit("message", buildLoginResponse(true));
    await connectPromise;

    const pending = client.sendCommand("players");
    const lastPacket = sock.send.mock.calls.at(-1)?.[0] as Buffer;
    expect(lastPacket[7]).toBe(0x01);
    expect(lastPacket[8]).toBe(0x00);

    sock.emit("message", buildSingleResponse(0, "Players on server:\n(0 players in total)"));
    await expect(pending).resolves.toMatchObject({ success: true });
    client.disconnect();
  });
});
