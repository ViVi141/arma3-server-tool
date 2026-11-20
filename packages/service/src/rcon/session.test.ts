import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

interface FakeClientInstance {
  connected: boolean;
  connectCalls: number;
  disconnectCalls: number;
  commands: string[];
  connect(): Promise<void>;
  disconnect(): void;
  sendCommand(command: string): Promise<{ success: boolean; message: string }>;
}

const { FakeClient, clients, state } = vi.hoisted(() => {
  const clients: FakeClientInstance[] = [];
  const state = { failNextConnect: false };

  class FakeClient {
    connected = false;
    connectCalls = 0;
    disconnectCalls = 0;
    commands: string[] = [];

    constructor(public options: Record<string, unknown>) {
      clients.push(this as unknown as FakeClientInstance);
    }

    async connect(): Promise<void> {
      this.connectCalls += 1;
      if (state.failNextConnect) {
        state.failNextConnect = false;
        throw new Error("login timeout");
      }
      this.connected = true;
    }

    disconnect(): void {
      this.disconnectCalls += 1;
      this.connected = false;
    }

    async sendCommand(command: string) {
      this.commands.push(command);
      return { success: true, message: command };
    }
  }

  return { FakeClient, clients, state };
});

vi.mock("./client.js", () => ({ RconClient: FakeClient }));

import {
  withRconClient,
  recordRconPlayers,
  getCachedOnlineCount,
  isRconCoolingDown,
  dropRconSession,
  closeAllRconSessions,
} from "./session.js";

const OPTIONS = { host: "127.0.0.1", port: 2303, password: "secret" };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("RCon session reuse", () => {
  beforeEach(() => {
    clients.length = 0;
    state.failNextConnect = false;
    closeAllRconSessions();
  });

  afterEach(() => {
    closeAllRconSessions();
  });

  it("reuses one login across sequential calls", async () => {
    await withRconClient("u1", OPTIONS, (client) => client.sendCommand("players"));
    await withRconClient("u1", OPTIONS, (client) => client.sendCommand("status"));

    expect(clients).toHaveLength(1);
    expect(clients[0].connectCalls).toBe(1);
    expect(clients[0].commands).toEqual(["players", "status"]);
  });

  it("shares the session between concurrent callers and serializes commands", async () => {
    const results = await Promise.all([
      withRconClient("u1", OPTIONS, async (client) => {
        await client.sendCommand("a");
        await sleep(5);
        return "first";
      }),
      withRconClient("u1", OPTIONS, async (client) => {
        await client.sendCommand("b");
        return "second";
      }),
    ]);

    expect(results).toEqual(["first", "second"]);
    expect(clients).toHaveLength(1);
    expect(clients[0].connectCalls).toBe(1);
    expect(clients[0].commands).toEqual(["a", "b"]);
  });

  it("rebuilds the session once when a command fails on an established login", async () => {
    await withRconClient("u1", OPTIONS, () => Promise.resolve("ok"));
    const first = clients[0];

    const result = await withRconClient("u1", OPTIONS, async (client) => {
      if ((client as unknown) === first) {
        throw new Error("socket lost");
      }
      return "retried";
    });

    expect(result).toBe("retried");
    expect(clients).toHaveLength(2);
    expect(first.disconnectCalls).toBe(1);
    expect(clients[1].connectCalls).toBe(1);
  });

  it("does not retry a failing fresh login (avoids doubling the timeout)", async () => {
    state.failNextConnect = true;

    await expect(
      withRconClient("u1", OPTIONS, () => Promise.resolve("never"))
    ).rejects.toThrow("login timeout");
    expect(clients).toHaveLength(1);
    expect(isRconCoolingDown("u1")).toBe(true);
  });

  it("keeps online-count snapshots independent of the session lifetime", async () => {
    await withRconClient("u1", OPTIONS, () => Promise.resolve("ok"));
    recordRconPlayers("u1", [{ num: 1, guid: "g1", name: "Alice" }]);
    expect(getCachedOnlineCount("u1")?.onlineCount).toBe(1);

    dropRconSession("u1");
    expect(getCachedOnlineCount("u1")).toBeNull();
    expect(isRconCoolingDown("u1")).toBe(false);
  });

  it("creates a fresh session when host/port/password changes", async () => {
    await withRconClient("u1", OPTIONS, () => Promise.resolve("ok"));
    await withRconClient("u1", { ...OPTIONS, port: 2306 }, () => Promise.resolve("ok"));

    expect(clients).toHaveLength(2);
    expect(clients[0].disconnectCalls).toBe(1);
  });
});
