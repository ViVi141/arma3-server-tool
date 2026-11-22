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
import { ServerHealthService } from "./health/service.js";
import { OperationsStore } from "./operations/store.js";
import { EmailNotifier } from "./operations/email.js";
import { wireHealthEvents } from "./operations/health-events.js";
import { MaintenancePlanner } from "./maintenance/planner.js";
import { MaintenanceExecutor } from "./maintenance/executor.js";
import { ServiceMaintenanceAdapter } from "./maintenance/adapter.js";
import { MaintenanceAutoScheduler } from "./maintenance/auto-scheduler.js";
import { closeAllRconSessions } from "./rcon/session.js";
import { AuthFailureLimiter } from "./util/auth-rate-limit.js";

export interface ServiceOptions {
  port: number;
  host: string;
  dataDir: string;
  apiToken?: string;
  opsReadToken?: string;
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
  const opsReadToken = (options.opsReadToken ?? process.env.A3ST_OPS_READ_TOKEN ?? "").trim();
  if (opsReadToken && safeTokenEquals(opsReadToken, options.apiToken?.trim() ?? "")) throw new Error("只读运维 Token 必须与管理 Token 不同");
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
  const operations = new OperationsStore(options.dataDir, () => Date.now(), () => {
    const values: string[] = [options.apiToken ?? "", opsReadToken, process.env.A3ST_SMTP_PASSWORD ?? ""];
    for (const { uuid } of configStore.listServers()) {
      const cfg = configStore.load(uuid);
      for (const value of [cfg?.battleye?.rconPassword, cfg?.basic?.password, cfg?.basic?.passwordAdmin, cfg?.basic?.passwordCommand]) {
        if (typeof value === "string" && value) values.push(value);
      }
    }
    return values;
  });
  try { await operations.waitReady(); }
  catch (error) { monitorDb.close(); throw error; }
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
  const serverHealth = new ServerHealthService(app);
  app.decorate("serverHealth", serverHealth);
  app.decorate("operations", operations);
  const maintenancePlanner = new MaintenancePlanner(app);
  app.decorate("maintenancePlanner", maintenancePlanner);
  const maintenanceAdapter = new ServiceMaintenanceAdapter(app);
  const maintenanceExecutor = new MaintenanceExecutor(operations, maintenanceAdapter);
  app.decorate("maintenanceExecutor", maintenanceExecutor);
  const maintenanceAutoScheduler = new MaintenanceAutoScheduler(app, maintenancePlanner, maintenanceExecutor);
  const unwireHealthEvents = wireHealthEvents(app);
  const emailNotifier = new EmailNotifier(operations, undefined, () => app.log.error("邮件状态落盘失败，保留待发送记录以供重试"));
  const operationsPruneTimer = setInterval(() => {
    try { operations.prune(); } catch { app.log.error("运维事件保留清理失败，数据未被宣布清理成功"); }
  }, 3600000);
  operationsPruneTimer.unref();

  // Auth hook
  app.decorateRequest("authenticated", false);
  const authFailureLimiter = new AuthFailureLimiter();
  app.addHook("onRequest", async (request, reply) => {
    const pathOnly = request.url.split("?")[0] ?? request.url;
    const clientIp = request.ip || "unknown";

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
    const auth = request.headers.authorization;
    const bearerToken = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const query = request.query as { token?: string };

    const markAuthed = () => {
      authFailureLimiter.clear(clientIp);
      request.authenticated = true;
    };

    const rejectUnauthorized = (message: string, code?: string) => {
      authFailureLimiter.recordFailure(clientIp);
      reply.status(401).send({
        success: false,
        message,
        ...(code ? { code } : {}),
      });
    };

    // 连续鉴权失败按 IP 限流，降低公网暴力枚举 API_TOKEN 的效率。
    if (token && authFailureLimiter.shouldBlock(clientIp)) {
      reply.status(429).send({
        success: false,
        message: "Too many authentication failures; try again later",
        code: "AUTH_RATE_LIMITED",
      });
      return;
    }

    const readOnlyCredential = safeTokenEquals(bearerToken, opsReadToken) || safeTokenEquals(request.headers["x-api-key"], opsReadToken);
    if (readOnlyCredential || safeTokenEquals(query.token, opsReadToken)) {
      const allowed = readOnlyCredential && !safeTokenEquals(query.token, opsReadToken) && request.method === "GET" && (
        pathOnly === "/api/v1/ops/events" || /^\/api\/v1\/servers\/[^/]+\/health$/.test(pathOnly) || /^\/api\/v1\/ops\/maintenance\/[^/]+$/.test(pathOnly)
      );
      if (!allowed) return reply.status(403).send({ success: false, error: "OPS_READ_ONLY", message: "此 Token 仅允许事件、健康和维护结果查询，且不能通过 URL 传递" });
      markAuthed();
      return;
    }

    // 公网/非本机绑定且未配置 API_TOKEN：拒绝一切管理能力（健康检查除外）。
    if (publicBind && !token) {
      rejectUnauthorized("Unauthorized: non-loopback bind requires API_TOKEN", "AUTH_REQUIRED");
      return;
    }

    if (!token) {
      (request as { authenticated: boolean }).authenticated = true;
      return;
    }
    if (safeTokenEquals(bearerToken, token)) {
      markAuthed();
      return;
    }
    if (safeTokenEquals(request.headers["x-api-key"], token)) {
      markAuthed();
      return;
    }
    // EventSource 无法设 Authorization，仅 SSE 等场景允许 ?token=（勿记入日志）。
    if (safeTokenEquals(query.token, token)) {
      markAuthed();
      return;
    }
    rejectUnauthorized("Unauthorized");
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
    // 取消维护后仍需完成恢复；不能先关闭它依赖的 Steam 队列、健康采样和数据库。
    await maintenanceAutoScheduler.close();
    await maintenanceExecutor.close();
    await Promise.all([maintenancePlanner.close(), steamCmd.close()]);
    unwireHealthEvents();
    serverHealth.close();
    clearInterval(operationsPruneTimer);
    await emailNotifier.close();
    operations.close();
    instanceSseManager.unwireSteamCmd(steamCmd);
    instanceSseManager.closeAll();
    stopAllHeadlessClients({ skipLocked: true, preservePids: maintenanceAdapter.restoredHeadlessPids() });
    closeAllRconSessions();
    await closeProxyAgents();
    monitorDb.close();
  });

  // 在监听端口和同步任何 Cron 之前重建维护锁并处理持久批次。
  try { await maintenanceExecutor.initialize(); }
  catch (error) { await app.close(); throw error; }

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
  serverHealth.start();
  emailNotifier.start();
  maintenancePlanner.start();
  maintenanceAutoScheduler.start();

  return app;
}

// Lazy-import route modules at bottom to avoid circular deps
import { healthRoutes } from "./api/health.js";
import { apiRoutes } from "./api/routes.js";
import { registerWebStatic, resolveWebRoot } from "./web-static.js";
