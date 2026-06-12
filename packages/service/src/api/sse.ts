import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SteamCmdManager } from "../steamcmd/manager.js";

interface SseClient {
  id: string;
  reply: FastifyReply;
}

export class SseManager {
  private steamCmdClients = new Set<string>();
  private clients = new Map<string, SseClient>();

  /** Register a SteamCMD SSE client */
  addSteamCmdClient(id: string, reply: FastifyReply): void {
    this.steamCmdClients.add(id);
    this.clients.set(id, { id, reply });

    reply.raw.on("close", () => {
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
          this.steamCmdClients.delete(id);
          this.clients.delete(id);
        }
      }
    }
  }

  /** Wire up SteamCmdManager events to SSE broadcast */
  wireSteamCmd(steamCmd: SteamCmdManager): void {
    steamCmd.on("output", (text: string) => this.broadcastSteamCmdOutput(text));
    steamCmd.on("progress", (text: string) => {
      this.broadcastSteamCmdOutput(`[进度] ${text}`);
    });
    steamCmd.on("complete", (output: string) => {
      this.broadcastSteamCmdOutput(`[完成] SteamCMD 执行完毕`);
    });
  }

  /** Register SSE routes on a Fastify instance */
  registerRoutes(app: FastifyInstance, steamCmd: SteamCmdManager, prefix = ""): void {
    app.get(`${prefix}/steamcmd/stream`, async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
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
      this.addSteamCmdClient(id, reply);

      // Keep alive
      const keepAlive = setInterval(() => {
        try { reply.raw.write(": keepalive\n\n"); } catch { clearInterval(keepAlive); }
      }, 15000);

      reply.raw.on("close", () => clearInterval(keepAlive));
    });
  }
}

export const sseManager = new SseManager();
