import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { getServicePlatformInfo } from "../platform/index.js";
import { isLoopbackHost } from "../util/host.js";
import { SERVICE_VERSION } from "../version.js";

/**
 * 本次 Service 进程的实例标识。桌面端用它确认端口上监听的是「本工具的服务」
 * 而不是恰好占用同一端口的其他程序（避免盲收养/盲杀）。
 */
const SERVICE_INSTANCE_ID = randomUUID();

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_req, _reply) => {
    const platform = getServicePlatformInfo();
    const opts = (app as { serviceOptions?: { port: number; host: string; apiToken?: string } }).serviceOptions
      ?? { port: 19580, host: "127.0.0.1" };
    const addr = app.server.address();
    const boundPort =
      addr && typeof addr !== "string" ? addr.port : opts.port;
    const bindHost = opts.host;
    const authConfigured = Boolean(opts.apiToken?.trim());
    const remoteAccessEnabled = !isLoopbackHost(bindHost);

    return {
      success: true,
      service: "Arma3ServerTools.Service",
      version: SERVICE_VERSION,
      instanceId: SERVICE_INSTANCE_ID,
      pid: process.pid,
      remoteAccessEnabled,
      authConfigured,
      bindHost,
      bindPort: boundPort,
      publicBaseUrl: remoteAccessEnabled
        ? `http://${bindHost === "0.0.0.0" ? "<host>" : bindHost}:${boundPort}`
        : `http://127.0.0.1:${boundPort}`,
      platform: platform.os,
      defaultServerExecutable: platform.serverExecutable,
      defaultServerDir: platform.serverDirExample,
      steamCmdBinary: platform.steamCmdBinary,
    };
  });

  app.get("/actions", async () => {
    return {
      success: true,
      requestId: randomUUID().slice(0, 12),
      data: {
        taskActions: [
          "status", "start", "stop", "restart", "save", "write_cfg", "apply",
          "switch_mission", "enable_mods", "disable_mods", "download_mods",
          "import_mods_html", "scan_mods", "update_server", "preflight",
          "rcon_players", "rcon_kick", "rcon_ban", "rcon_broadcast",
          "rcon_mission", "rcon_lock", "rcon_unlock", "read_logs",
          "stop_steamcmd", "steamcmd_status", "ensure_steamcmd",
          "install_dedicated_server", "create_server", "first_server_setup",
          "help",
        ],
        restEndpoints: [
          { method: "GET", path: "/api/v1/health" },
          { method: "GET", path: "/api/v1/actions" },
          { method: "GET", path: "/api/v1/servers" },
          { method: "POST", path: "/api/v1/servers" },
          { method: "GET", path: "/api/v1/servers/{uuid}/status" },
          { method: "GET", path: "/api/v1/servers/{uuid}/dashboard" },
          { method: "GET", path: "/api/v1/servers/{uuid}/config" },
          { method: "PUT", path: "/api/v1/servers/{uuid}/config" },
          { method: "PATCH", path: "/api/v1/servers/{uuid}/config" },
          { method: "POST", path: "/api/v1/servers/{uuid}/clone" },
          { method: "DELETE", path: "/api/v1/servers/{uuid}" },
          { method: "PUT", path: "/api/v1/servers/{uuid}/rename" },
          { method: "GET", path: "/api/v1/servers/{uuid}/preflight" },
          { method: "GET", path: "/api/v1/settings/steamcmd" },
          { method: "PUT", path: "/api/v1/settings/steamcmd" },
          { method: "GET", path: "/api/v1/steamcmd/status" },
          { method: "GET", path: "/api/v1/steamcmd/log" },
          { method: "POST", path: "/api/v1/steamcmd/stop" },
          { method: "POST", path: "/api/v1/task" },
          { method: "GET", path: "/api/v1/tasks/{taskId}" },
          { method: "DELETE", path: "/api/v1/tasks/{taskId}" },
          { method: "POST", path: "/api/v1/servers/{uuid}/mods/import-preview" },
        ],
        fileUploads: [
          "/api/v1/servers/{uuid}/files/mission-pbo",
          "/api/v1/servers/{uuid}/files/mod-list-html",
        ],
      },
    };
  });
}
