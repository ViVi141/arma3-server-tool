import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SteamCmdManager } from "../steamcmd/manager.js";

interface SseClient {
  id: string;
  reply: FastifyReply;
  keepAlive?: ReturnType<typeof setInterval>;
}

interface WiredSteamCmdListeners {
  onOutput: (text: string) => void;
  onProgress: (text: string) => void;
  onComplete: (output: string) => void;
}

export class SseManager {
  private steamCmdClients = new Set<string>();
  private clients = new Map<string, SseClient>();
  private wiredListeners = new Map<SteamCmdManager, WiredSteamCmdListeners>();

  /** Register a SteamCMD SSE client */
  addSteamCmdClient(id: string, reply: FastifyReply, keepAlive?: ReturnType<typeof setInterval>): void {
    this.steamCmdClients.add(id);
    this.clients.set(id, { id, reply, keepAlive });

    reply.raw.on("close", () => {
      const client = this.clients.get(id);
      if (client?.keepAlive) {
        clearInterval(client.keepAlive);
      }
      this.steamCmdClients.delete(id);
      this.clients.delete(id);
    });
  }

  /** Broadcast a SteamCMD output event to all connected SSE clients */
  broadcastSteamCmdOutput(text: string): void {
    const data = JSON.stringify({ type: "output", text, time: new Date().toISOString() });
    for (const id of this.steamCmdClients) {
      const client = this.clients.get(id);
      if (client) {
        try {
          client.reply.raw.write(`data: ${data}\n\n`);
        } catch {
          if (client.keepAlive) {
            clearInterval(client.keepAlive);
          }
          this.steamCmdClients.delete(id);
          this.clients.delete(id);
        }
      }
    }
  }

  /** Wire up SteamCmdManager events to SSE broadcast */
  wireSteamCmd(steamCmd: SteamCmdManager): () => void {
    this.unwireSteamCmd(steamCmd);
    const listeners: WiredSteamCmdListeners = {
      onOutput: (text: string) => this.broadcastSteamCmdOutput(text),
      onProgress: (text: string) => {
        this.broadcastSteamCmdOutput(`[进度] ${text}`);
      },
      onComplete: () => {
        this.broadcastSteamCmdOutput(`[完成] SteamCMD 执行完毕`);
      },
    };
    this.wiredListeners.set(steamCmd, listeners);
    steamCmd.on("output", listeners.onOutput);
    steamCmd.on("progress", listeners.onProgress);
    steamCmd.on("complete", listeners.onComplete);
    return () => this.unwireSteamCmd(steamCmd);
  }

  /** Remove SSE listeners previously wired to a SteamCmdManager instance */
  unwireSteamCmd(steamCmd: SteamCmdManager): void {
    const listeners = this.wiredListeners.get(steamCmd);
    if (!listeners) {
      return;
    }
    steamCmd.off("output", listeners.onOutput);
    steamCmd.off("progress", listeners.onProgress);
    steamCmd.off("complete", listeners.onComplete);
    this.wiredListeners.delete(steamCmd);
  }

  /** Clear keepalive timers and close all active SSE streams */
  closeAll(): void {
    for (const client of this.clients.values()) {
      if (client.keepAlive) {
        clearInterval(client.keepAlive);
      }
      try {
        client.reply.raw.end();
      } catch {
        /* ignore */
      }
    }
    this.steamCmdClients.clear();
    this.clients.clear();
  }

  /** Register SSE routes on a Fastify instance */
  registerRoutes(app: FastifyInstance, steamCmd: SteamCmdManager, prefix = ""): void {
    app.get(`${prefix}/steamcmd/stream`, async (req: FastifyRequest, reply: FastifyReply) => {
      reply.hijack();
      const origin = req.headers.origin;
      const allowOrigin = origin && origin !== "null" ? origin : "*";
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": allowOrigin,
      });
      reply.raw.write(`data: ${JSON.stringify({ type: "connected", message: "已连接 SteamCMD 输出流" })}\n\n`);

      const history = steamCmd.getAggregatedLog(150);
      if (history.trim()) {
        const historyData = JSON.stringify({
          type: "output",
          text: `${history}\n`,
          time: new Date().toISOString(),
        });
        reply.raw.write(`data: ${historyData}\n\n`);
      }
      if (steamCmd.isRunning) {
        const runningData = JSON.stringify({
          type: "output",
          text: "[提示] SteamCMD 正在后台运行，实时同步 console_log.txt…\n",
          time: new Date().toISOString(),
        });
        reply.raw.write(`data: ${runningData}\n\n`);
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Keep alive
      const keepAlive = setInterval(() => {
        try {
          reply.raw.write(": keepalive\n\n");
        } catch {
          clearInterval(keepAlive);
        }
      }, 15000);

      this.addSteamCmdClient(id, reply, keepAlive);
    });
  }
}

export const sseManager = new SseManager();
