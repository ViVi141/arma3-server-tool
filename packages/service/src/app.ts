import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { processManager, ProcessManager } from "./process/index.js";
import { ConfigStore } from "./config/index.js";
import { ConfigSnapshotStore } from "./config/snapshot.js";
import { SteamCmdManager } from "./steamcmd/index.js";
import { ModScanner } from "./mods/index.js";
import { MonitoringDb } from "./monitoring/index.js";
import { Scheduler } from "./scheduling/index.js";
import { asyncTaskManager } from "./task/index.js";
import { RptLogReader } from "./logs/index.js";
import { sseManager } from "./api/sse.js";
import { UiSettingsStore } from "./settings/ui-settings.js";
import { ModScanPathStore } from "./mods/scan-path-store.js";
import { SteamCmdSettingsStore } from "./settings/steamcmd-settings.js";
import { applySteamCmdSettings } from "./settings/apply-steamcmd-settings.js";

export interface ServiceOptions {
  port: number;
  host: string;
  dataDir: string;
  apiToken?: string;
}

export async function createService(options: ServiceOptions) {
  const app = Fastify({ logger: true });

  // Instantiate services
  const configStore = new ConfigStore(options.dataDir);
  const snapshotStore = new ConfigSnapshotStore(options.dataDir);
  const steamCmd = new SteamCmdManager(options.dataDir);
  const modScanner = new ModScanner();
  const monitorDb = new MonitoringDb(options.dataDir);
  const scheduler = new Scheduler();
  const rptLogReader = new RptLogReader();
  const uiSettingsStore = new UiSettingsStore(options.dataDir);
  const modScanPathStore = new ModScanPathStore(options.dataDir);
  const steamCmdSettingsStore = new SteamCmdSettingsStore(options.dataDir);

  applySteamCmdSettings(steamCmd, steamCmdSettingsStore.load());

  // Decorate
  app.decorate("configStore", configStore);
  app.decorate("snapshotStore", snapshotStore);
  app.decorate("processManager", processManager);
  app.decorate("steamCmd", steamCmd);
  app.decorate("modScanner", modScanner);
  app.decorate("monitorDb", monitorDb);
  app.decorate("scheduler", scheduler);
  app.decorate("rptLogReader", rptLogReader);
  app.decorate("uiSettingsStore", uiSettingsStore);
  app.decorate("modScanPathStore", modScanPathStore);
  app.decorate("steamCmdSettingsStore", steamCmdSettingsStore);
  app.decorate("asyncTaskManager", asyncTaskManager);
  app.decorate("dataDir", options.dataDir);

  // Auth hook
  app.decorateRequest("authenticated", false);
  app.addHook("onRequest", async (request, reply) => {
    const pathOnly = request.url.split("?")[0] ?? request.url;
    if (pathOnly === "/api/v1/health" || pathOnly === "/api/v1/actions") {
      return;
    }
    const token = options.apiToken;
    if (!token) {
      (request as { authenticated: boolean }).authenticated = true;
      return;
    }
    const auth = request.headers.authorization;
    if (auth?.startsWith("Bearer ") && auth.slice(7) === token) {
      (request as { authenticated: boolean }).authenticated = true;
      return;
    }
    if (request.headers["x-api-key"] === token) {
      (request as { authenticated: boolean }).authenticated = true;
      return;
    }
    const query = request.query as { token?: string };
    if (query.token === token) {
      (request as { authenticated: boolean }).authenticated = true;
      return;
    }
    reply.status(401).send({ success: false, message: "Unauthorized" });
  });

  // Plugins
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

  // Wire SSE to SteamCMD events
  sseManager.wireSteamCmd(steamCmd);

  // Routes
  await app.register(healthRoutes, { prefix: "/api/v1" });
  sseManager.registerRoutes(app, "/api/v1");
  await app.register(apiRoutes, { prefix: "/api/v1" });

  await app.listen({ port: options.port, host: options.host });
  app.log.info(`Service listening on ${options.host}:${options.port}`);

  return app;
}

// Lazy-import route modules at bottom to avoid circular deps
import { healthRoutes } from "./api/health.js";
import { apiRoutes } from "./api/routes.js";
