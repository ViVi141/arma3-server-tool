import { describe, it, expect, vi, afterEach } from "vitest";
import { SseManager } from "../api/sse.js";
import { SteamCmdManager } from "../steamcmd/manager.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("SseManager + SteamCmdManager integration", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-sse-test-"));

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("broadcasts SteamCMD output events to SSE clients", () => {
    const sse = new SseManager();
    const steamCmd = new SteamCmdManager(tmpDir);

    // Wire them together (same as app.ts)
    sse.wireSteamCmd(steamCmd);

    // Mock SSE client
    const mockWrite = vi.fn();
    const mockReply = {
      raw: {
        write: mockWrite,
        on: vi.fn(),
      },
    } as unknown as import("fastify").FastifyReply;

    sse.addSteamCmdClient("test-client", mockReply);

    // Emit SteamCMD output
    steamCmd.emit("output", "Downloading app 233780... 45%");
    steamCmd.emit("output", "Progress: 1024/2048 MB");
    steamCmd.emit("progress", "下载 SteamCMD... 75%");
    steamCmd.emit("complete", "Done");

    // Verify all events were broadcast
    expect(mockWrite).toHaveBeenCalledTimes(4);

    const calls = mockWrite.mock.calls.map((c: unknown[]) => (c[0] as string).toString());

    // Check output event
    expect(calls[0]).toContain("Downloading app 233780... 45%");
    expect(calls[0]).toContain('"type":"output"');

    expect(calls[1]).toContain("Progress: 1024/2048 MB");

    // Check progress event
    expect(calls[2]).toContain("[进度] 下载 SteamCMD... 75%");

    // Check complete event
    expect(calls[3]).toContain("[完成]");
  });

  it("handles multiple SSE clients", () => {
    const sse = new SseManager();
    const steamCmd = new SteamCmdManager(tmpDir);
    sse.wireSteamCmd(steamCmd);

    const client1 = { raw: { write: vi.fn(), on: vi.fn() } } as unknown as import("fastify").FastifyReply;
    const client2 = { raw: { write: vi.fn(), on: vi.fn() } } as unknown as import("fastify").FastifyReply;

    sse.addSteamCmdClient("c1", client1);
    sse.addSteamCmdClient("c2", client2);

    steamCmd.emit("output", "test");

    expect(client1.raw.write).toHaveBeenCalledTimes(1);
    expect(client2.raw.write).toHaveBeenCalledTimes(1);
  });

  it("removes disconnected clients", () => {
    const sse = new SseManager();
    const steamCmd = new SteamCmdManager(tmpDir);
    sse.wireSteamCmd(steamCmd);

    let closeHandler: (() => void) | null = null;
    const client = {
      raw: {
        write: vi.fn(),
        on: vi.fn((_event: string, handler: () => void) => { closeHandler = handler; }),
      },
    } as unknown as import("fastify").FastifyReply;

    sse.addSteamCmdClient("c1", client);

    // Simulate disconnect
    closeHandler!();
    steamCmd.emit("output", "after disconnect");

    // Should NOT have been called again after disconnect
    expect(client.raw.write).toHaveBeenCalledTimes(0);
  });

  it("handles write errors gracefully", () => {
    const sse = new SseManager();
    const steamCmd = new SteamCmdManager(tmpDir);
    sse.wireSteamCmd(steamCmd);

    const client = {
      raw: {
        write: vi.fn(() => { throw new Error("write failed"); }),
        on: vi.fn(),
      },
    } as unknown as import("fastify").FastifyReply;

    sse.addSteamCmdClient("c1", client);

    // Should not throw
    expect(() => steamCmd.emit("output", "test")).not.toThrow();
  });
});
