import Fastify, { type FastifyInstance } from "fastify";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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
import { SseManager } from "./api/sse.js";
import { UiSettingsStore } from "./settings/ui-settings.js";
import { ModScanPathStore } from "./mods/scan-path-store.js";
import { SteamCmdSettingsStore } from "./settings/steamcmd-settings.js";
import { applySteamCmdSettings } from "./settings/apply-steamcmd-settings.js";
import { stopAllHeadlessClients } from "./process/headless.js";
import { closeProxyAgents } from "./steamcmd/proxy-fetch.js";

export interface ServiceOptions {
  port: number;
  host: string;
  dataDir: string;
  apiToken?: string;
  logStream?: NodeJS.WritableStream;
}

const TOKEN_COMPARE_KEY = randomBytes(32);

export function redactQueryToken(url: string): string {
  return url.replace(/([?&]token=)[^&#]*/gi, "$1***");
}

export function safeTokenEquals(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || !expected) {
    return false;
  }
  const a = createHmac("sha256", TOKEN_COMPARE_KEY).update(provided, "utf8").digest();
  const b = createHmac("sha256", TOKEN_COMPARE_KEY).update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

import { isLoopbackHost } from "./util/host.js";
import { isAllowedCorsOrigin, isAllowedRequestOrigin } from "./util/origin.js";

const LISTEN_RETRY_CODES = new Set(["EADDRINUSE", "EACCES", "EADDRNOTAVAIL"]);

async function listenWithRetry(
  app: FastifyInstance,
  port: number,
  host: string
): Promise<void> {
  const attempts = 15;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await app.listen({ port, host });
      return;
    } catch (error) {
      lastError = error;
      let code = "";
      if (error instanceof Error && "code" in error) {
        code = String((error as NodeJS.ErrnoException).code ?? "");
      }
      const retryable = LISTEN_RETRY_CODES.has(code);
      if (!retryable || attempt === attempts) {
        app.log.error(error);
        throw error;
      }
      app.log.error(`Listen ${host}:${port} failed (${code}), retry ${attempt}/${attempts}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

export async function createService(options: ServiceOptions) {
  const app = Fastify({
    logger: {
      redact: {
        paths: ["req.headers.authorization", 'req.headers["x-api-key"]'],
        censor: "[REDACTED]",
      },
      serializers: {
        req(request) {
          const acceptVersion = request.headers?.["accept-version"];
          return {
            method: request.method,
            url: redactQueryToken(request.url),
            version: typeof acceptVersion === "string" ? acceptVersion : undefined,
            host: request.host,
            remoteAddress: request.ip,
            remotePort: request.socket?.remotePort,
          };
        },
      },
      ...(options.logStream ? { stream: options.logStream } : {}),
    },
  });

  // Instantiate services
  const configStore = new ConfigStore(options.dataDir);
  const snapshotStore = new ConfigSnapshotStore(options.dataDir);
  const steamCmd = new SteamCmdManager(options.dataDir, {
    applicationBase: process.cwd(),
    userDataDirectory: options.dataDir,
  });
  const modScanner = new ModScanner();
  const monitorDb = new MonitoringDb(options.dataDir);
  await monitorDb.waitReady();
  const scheduler = new Scheduler();
  const rptLogReader = new RptLogReader();
  const uiSettingsStore = new UiSettingsStore(options.dataDir);
  const modScanPathStore = new ModScanPathStore(options.dataDir);
  const steamCmdSettingsStore = new SteamCmdSettingsStore(options.dataDir);

  applySteamCmdSettings(
    steamCmd,
    steamCmdSettingsStore.load(),
    modScanPathStore.list().map((entry) => entry.modulePath),
  );

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
  app.decorate("serviceOptions", options);

  // Auth hook
  app.decorateRequest("authenticated", false);
  app.addHook("onRequest", async (request, reply) => {
    const pathOnly = request.url.split("?")[0] ?? request.url;

    // 任意网页不得驱动本机 API：Origin 不在白名单（且非同源）直接拒绝，
    // 覆盖无需 CORS 预检的简单请求（表单 POST 等）。
    if (
      pathOnly.startsWith("/api/") &&
      !isAllowedRequestOrigin(request.headers.origin, request.headers.host)
    ) {
      reply.status(403).send({
        success: false,
        message: "Forbidden: origin not allowed",
        code: "ORIGIN_NOT_ALLOWED",
      });
      return;
    }

    // 静态 UI（/, /assets/*）不能要求 Bearer：浏览器直接打开页面时没有 Authorization。
    if (!pathOnly.startsWith("/api/")) {
      (request as { authenticated: boolean }).authenticated = true;
      return;
    }

    if (pathOnly === "/api/v1/health" || pathOnly === "/api/v1/actions") {
      return;
    }

    const token = options.apiToken?.trim() ?? "";
    const publicBind = !isLoopbackHost(options.host);

    // 公网/非本机绑定且未配置 API_TOKEN：拒绝一切管理能力（健康检查除外）。
    if (publicBind && !token) {
      reply.status(401).send({
        success: false,
        message: "Unauthorized: non-loopback bind requires API_TOKEN",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (!token) {
      (request as { authenticated: boolean }).authenticated = true;
      return;
    }
    const auth = request.headers.authorization;
    const bearerToken = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    if (safeTokenEquals(bearerToken, token)) {
      (request as { authenticated: boolean }).authenticated = true;
      return;
    }
    if (safeTokenEquals(request.headers["x-api-key"], token)) {
      (request as { authenticated: boolean }).authenticated = true;
      return;
    }
    // EventSource 无法设 Authorization，仅 SSE 等场景允许 ?token=（勿记入日志）。
    const query = request.query as { token?: string };
    if (safeTokenEquals(query.token, token)) {
      (request as { authenticated: boolean }).authenticated = true;
      return;
    }
    reply.status(401).send({ success: false, message: "Unauthorized" });
  });

  // CORS 白名单：回环地址 / Capacitor / file://（Origin: null）/ A3ST_ALLOWED_ORIGINS。
  // 其他站点不返回 CORS 头（浏览器读不到响应），并由 onRequest 直接拒绝。
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || origin === "null") {
        cb(null, "*");
        return;
      }
      cb(null, isAllowedCorsOrigin(origin) ? origin : false);
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Api-Key", "Accept"],
  });
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB
  app.addContentTypeParser("text/html", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  // Wire SSE to SteamCMD events (per-service instance to avoid listener leaks)
  const instanceSseManager = new SseManager();
  instanceSseManager.wireSteamCmd(steamCmd);

  app.addHook("onClose", async () => {
    scheduler.clear();
    instanceSseManager.unwireSteamCmd(steamCmd);
    instanceSseManager.closeAll();
    stopAllHeadlessClients();
    await closeProxyAgents();
    monitorDb.close();
  });

  // Routes
  await app.register(healthRoutes, { prefix: "/api/v1" });
  instanceSseManager.registerRoutes(app, steamCmd, "/api/v1");
  await app.register(apiRoutes, { prefix: "/api/v1" });

  const webRoot = resolveWebRoot();
  if (webRoot) {
    await registerWebStatic(app, webRoot);
  } else {
    app.log.error(
      "Web UI root not found. GET / will return 404 until WEB_ROOT or packages/web/dist is available."
    );
  }

  await listenWithRetry(app, options.port, options.host);
  app.log.info(`Service listening on ${options.host}:${options.port}`);

  const { syncAllCronJobs } = await import("./scheduling/cron-sync.js");
  const cronCount = syncAllCronJobs(app);
  app.log.info(`Cron jobs synced on startup: ${cronCount} job(s)`);

  return app;
}

// Lazy-import route modules at bottom to avoid circular deps
import { healthRoutes } from "./api/health.js";
import { apiRoutes } from "./api/routes.js";
import { registerWebStatic, resolveWebRoot } from "./web-static.js";
