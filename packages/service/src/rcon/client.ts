import * as net from "node:net";
import { EventEmitter } from "node:events";
import {
  encodeLoginPacket,
  encodeCommandPacket,
  parsePacket,
} from "./packet.js";
import type { RconPlayer, RconResponse } from "../types/rcon.js";

export interface RconClientOptions {
  host: string;
  port: number;
  password: string;
  timeout?: number; // default 5000ms
}

type ConnectionState = "disconnected" | "connecting" | "authenticating" | "connected";

const MULTIPACKET_SEPARATOR = "\n\n\n";

export class RconClient extends EventEmitter {
  private options: Required<RconClientOptions>;
  private socket: net.Socket | null = null;
  private state: ConnectionState = "disconnected";
  private seq = 0;
  private buffer = Buffer.alloc(0);
  private pendingResolve: ((value: RconResponse) => void) | null = null;

  constructor(options: RconClientOptions) {
    super();
    this.options = {
      timeout: 5000,
      ...options,
    };
  }

  get connected(): boolean {
    return this.state === "connected";
  }

  async connect(): Promise<void> {
    if (this.state !== "disconnected") return;

    return new Promise((resolve, reject) => {
      this.state = "connecting";
      this.socket = new net.Socket();

      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new Error("RCon connection timeout"));
      }, this.options.timeout);

      this.socket.connect(this.options.port, this.options.host, () => {
        clearTimeout(timeout);
        this.authenticate().then(resolve).catch(reject);
      });

      this.socket.on("data", (data: Buffer) => this.onData(data));

      this.socket.on("error", (err) => {
        clearTimeout(timeout);
        this.state = "disconnected";
        reject(err);
      });

      this.socket.on("close", () => {
        this.state = "disconnected";
        this.emit("disconnected");
      });
    });
  }

  private async authenticate(): Promise<void> {
    this.state = "authenticating";
    const packet = encodeLoginPacket(this.options.password);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new Error("RCon authentication timeout"));
      }, this.options.timeout);

      this.pendingResolve = (response: RconResponse) => {
        clearTimeout(timeout);
        if (response.success) {
          this.state = "connected";
          this.emit("connected");
          resolve();
        } else {
          this.cleanup();
          reject(new Error(`RCon login failed: ${response.message}`));
        }
      };

      this.socket!.write(packet);
    });
  }

  async sendCommand(command: string): Promise<RconResponse> {
    if (this.state !== "connected") {
      return { success: false, message: "Not connected" };
    }

    const seq = this.seq++;
    const packet = encodeCommandPacket(seq, command);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResolve = null;
        resolve({ success: false, message: "Command timeout" });
      }, this.options.timeout);

      this.pendingResolve = (response: RconResponse) => {
        clearTimeout(timeout);
        resolve(response);
      };

      this.socket!.write(packet);
    });
  }

  async getPlayers(): Promise<RconPlayer[]> {
    const resp = await this.sendCommand("players");
    if (!resp.success) return [];
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

  private onData(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);

    // Try to parse complete packets
    while (this.buffer.length >= 8) {
      // Check for "BE" header
      if (this.buffer[0] !== 0x42 || this.buffer[1] !== 0x45) {
        // Skip garbage bytes
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      // Need at least header (7) + min 1 byte payload
      if (this.buffer.length < 8) break;

      const payloadLen = this.buffer.length - 7;
      const packetData = this.buffer.subarray(0, 7 + payloadLen);
      const parsed = parsePacket(packetData);

      if (parsed) {
        this.buffer = this.buffer.subarray(7 + payloadLen);
        this.handleResponse(parsed.type, parsed.payload);
      } else {
        this.buffer = this.buffer.subarray(1);
      }
    }
  }

  private handleResponse(type: number, payload: Uint8Array): void {
    const text = new TextDecoder().decode(payload);

    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      resolve({
        success: type === 0x00,
        message: text.trim(),
        raw: text,
      });
    }

    // Emit server messages separately
    if (type === 0x01) {
      this.emit("server-message", text.trim());
    }
  }

  private parsePlayerList(raw: string): RconPlayer[] {
    const players: RconPlayer[] = [];
    const lines = raw.split("\n");

    for (const line of lines) {
      const match = line.match(
        /^\s*(\d+)\s+([0-9a-fA-F]+)\s+(.+)/m
      );
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
    this.pendingResolve = null;
    this.buffer = Buffer.alloc(0);
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
  }
}
