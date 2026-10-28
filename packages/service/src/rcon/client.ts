import * as dgram from "node:dgram";
import { EventEmitter } from "node:events";
import {
  encodeLoginRequest,
  encodeCommandRequest,
  encodeServerMessageAck,
  decodePacket,
  type DecodedPacket,
} from "./packet.js";
import type { RconPlayer, RconResponse } from "../types/rcon.js";

export interface RconClientOptions {
  host: string;
  port: number;
  password: string;
  /** Overall timeout per operation, ms (default 5000). */
  timeout?: number;
  /** Retransmit interval for UDP packets, ms (default 1000). */
  retryIntervalMs?: number;
}

type ConnectionState = "disconnected" | "connecting" | "connected";

interface PendingCommand {
  seq: number;
  finish: (value: RconResponse) => void;
  chunks: Map<number, string>;
  fragCount: number;
  gotSingle: boolean;
  deadline: ReturnType<typeof setTimeout>;
  retryTimer: ReturnType<typeof setInterval>;
}

/**
 * BattlEye RCon v2 client. Transport is UDP against the game/RCon port, so
 * every request must be retransmitted until a matching response arrives, and
 * server-initiated messages (type 0x02) must be acknowledged.
 */
export class RconClient extends EventEmitter {
  private options: Required<RconClientOptions>;
  private socket: dgram.Socket | null = null;
  private state: ConnectionState = "disconnected";
  private seq = 0;
  private readonly pending = new Map<number, PendingCommand>();
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RconClientOptions) {
    super();
    this.options = {
      timeout: 5000,
      retryIntervalMs: 1000,
      ...options,
    };
  }

  get connected(): boolean {
    return this.state === "connected";
  }

  async connect(): Promise<void> {
    if (this.state !== "disconnected") {
      return;
    }
    this.state = "connecting";

    return new Promise<void>((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      this.socket = socket;

      socket.on("message", (msg) => this.onMessage(msg));
      socket.on("error", (err) => {
        this.cleanup();
        reject(err);
      });

      const loginPacket = Buffer.from(encodeLoginRequest(this.options.password));

      const failTimer = setTimeout(() => {
        clearInterval(retryTimer);
        this.cleanup();
        reject(
          new Error(
            "RCon 登录超时：服务器未在 BE RCon 端口响应（请确认端口为 UDP 游戏端口、rcon 密码正确且服务器已启用 RCon）"
          )
        );
      }, this.options.timeout);

      const retryTimer = setInterval(() => {
        this.trySend(loginPacket);
      }, this.options.retryIntervalMs);

      // Send immediately, then rely on retries until a login response lands.
      this.trySend(loginPacket);

      const handler = (rp: DecodedPacket) => {
        if (rp.kind !== "loginResponse") {
          return false;
        }
        clearTimeout(failTimer);
        clearInterval(retryTimer);
        if (rp.loginOk) {
          this.state = "connected";
          this.startKeepAlive();
          this.emit("connected");
          resolve();
        } else {
          this.cleanup();
          reject(new Error("RCon 登录失败：密码被服务器拒绝"));
        }
        return true;
      };
      this.loginWaiter = handler;
    }).finally(() => {
      this.loginWaiter = null;
    });
  }

  private loginWaiter: ((rp: DecodedPacket) => boolean) | null = null;

  async sendCommand(command: string): Promise<RconResponse> {
    if (this.state !== "connected" || !this.socket) {
      return { success: false, message: "Not connected" };
    }

    const seq = this.nextSeq();
    const packet = Buffer.from(encodeCommandRequest(seq, command));

    return new Promise<RconResponse>((resolve) => {
      const chunks = new Map<number, string>();

      const finish = (resp: RconResponse) => {
        const entry = this.pending.get(seq);
        if (entry) {
          clearTimeout(entry.deadline);
          clearInterval(entry.retryTimer);
          this.pending.delete(seq);
        }
        resolve(resp);
      };

      const deadline = setTimeout(() => {
        finish({ success: false, message: "Command timeout" });
      }, this.options.timeout);

      const retryTimer = setInterval(() => {
        this.trySend(packet);
      }, this.options.retryIntervalMs);

      this.pending.set(seq, {
        seq,
        finish,
        chunks,
        fragCount: 1,
        gotSingle: false,
        deadline,
        retryTimer,
      });

      this.trySend(packet);
    });
  }

  private nextSeq(): number {
    this.seq = (this.seq + 1) & 0xff;
    return this.seq;
  }

  private trySend(packet: Buffer): void {
    if (!this.socket) {
      return;
    }
    try {
      this.socket.send(packet, this.options.port, this.options.host, () => undefined);
    } catch {
      // ignore transient send errors; retries will follow
    }
  }

  private onMessage(buf: Buffer): void {
    const pkt = decodePacket(new Uint8Array(buf));
    if (!pkt) {
      return;
    }

    // Server-initiated messages must always be acknowledged.
    if (pkt.kind === "serverMessage") {
      this.trySend(Buffer.from(encodeServerMessageAck(pkt.seq)));
      if (pkt.message.trim()) {
        this.emit("server-message", pkt.message.trim());
      }
      return;
    }

    if (pkt.kind === "loginResponse") {
      if (this.loginWaiter) {
        this.loginWaiter(pkt);
      }
      return;
    }

    if (pkt.kind === "commandResponse") {
      this.handleCommandResponse(pkt);
    }
  }

  private handleCommandResponse(pkt: DecodedPacket): void {
    const entry = this.pending.get(pkt.seq);
    if (!entry) {
      return;
    }

    if (pkt.fragCount && pkt.fragCount > 1) {
      const index = pkt.fragIndex ?? 0;
      const existing = (entry.chunks.get(index) ?? "") + pkt.message;
      entry.chunks.set(index, existing);
      entry.fragCount = pkt.fragCount;
      if (entry.chunks.size >= pkt.fragCount) {
        const full = Array.from(entry.chunks.keys())
          .sort((a, b) => a - b)
          .map((k) => entry.chunks.get(k) ?? "")
          .join("");
        entry.finish({ success: true, message: full.trim(), raw: full });
      }
      return;
    }

    // Single (or first) fragment. Some servers still split with a leading
    // count==1 header; treat as complete.
    entry.gotSingle = true;
    entry.chunks.set(0, (entry.chunks.get(0) ?? "") + pkt.message);
    entry.finish({
      success: true,
      message: (entry.chunks.get(0) ?? "").trim(),
      raw: entry.chunks.get(0) ?? "",
    });
  }

  async getPlayers(): Promise<RconPlayer[]> {
    const resp = await this.sendCommand("players");
    if (!resp.success) {
      return [];
    }
    return this.parsePlayerList(resp.message);
  }

  async kick(playerId: string, reason?: string): Promise<RconResponse> {
    const cmd = reason ? `kick ${playerId} ${reason}` : `kick ${playerId}`;
    return this.sendCommand(cmd);
  }

  async ban(
    target: string,
    timeMinutes?: number,
    reason?: string
  ): Promise<RconResponse> {
    const time = timeMinutes != null ? ` ${timeMinutes}` : "";
    const why = reason ? ` ${reason}` : "";
    return this.sendCommand(`ban ${target}${time}${why}`);
  }

  async loadMission(missionName: string): Promise<RconResponse> {
    return this.sendCommand(`#mission ${missionName}`);
  }

  async broadcast(message: string): Promise<RconResponse> {
    return this.sendCommand(`#say -1 ${message}`);
  }

  async shutdown(): Promise<RconResponse> {
    return this.sendCommand("#shutdown");
  }

  disconnect(): void {
    this.cleanup();
  }

  private startKeepAlive(): void {
    // An empty command packet every <45s keeps the login alive.
    this.keepAliveTimer = setInterval(() => {
      if (this.state === "connected") {
        const seq = this.nextSeq();
        this.trySend(Buffer.from(encodeCommandRequest(seq, " ")));
      }
    }, 30_000);
    // Do not keep the event loop alive just for the keepalive.
    this.keepAliveTimer.unref?.();
  }

  private parsePlayerList(raw: string): RconPlayer[] {
    const players: RconPlayer[] = [];
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*(\d+)\s+([0-9a-fA-F]{8,})\s+(.+?)\s*:/);
      if (match) {
        players.push({
          num: parseInt(match[1], 10),
          guid: match[2],
          name: match[3].trim(),
        });
      }
    }
    return players;
  }

  private cleanup(): void {
    this.state = "disconnected";
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    for (const entry of this.pending.values()) {
      clearTimeout(entry.deadline);
      clearInterval(entry.retryTimer);
    }
    this.pending.clear();
    this.loginWaiter = null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    this.emit("disconnected");
  }
}
