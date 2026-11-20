import type { FastifyInstance } from "fastify";
import { ExpiredOperationsCursor, FutureOperationsCursor } from "../../operations/store.js";
import { InvalidNotificationSettings } from "../../operations/notification-settings.js";
import { envelope } from "./shared.js";
import { InvalidMaintenanceRequest } from "../../maintenance/planner.js";

export function registerOperationsRoutes(app: FastifyInstance): void {
  const settingsData = () => ({ ...app.operations.notificationSettings(), passwordConfigured: Boolean(process.env.A3ST_SMTP_PASSWORD),
    readTokenConfigured: Boolean((app.serviceOptions.opsReadToken ?? process.env.A3ST_OPS_READ_TOKEN ?? "").trim()) });
  app.get("/ops/notifications/settings", async () => envelope(true, settingsData(), null, ""));
  app.put("/ops/notifications/settings", async (req, reply) => {
    try {
      app.operations.saveNotificationSettings(req.body);
      return envelope(true, settingsData(), null, "");
    } catch (error) {
      if (error instanceof InvalidNotificationSettings) return reply.status(400).send(envelope(false, { message: error.message }, "INVALID_SETTINGS", ""));
      throw error;
    }
  });
  app.get("/ops/notifications/deliveries", async () => envelope(true, app.operations.deliveries(), null, ""));
  app.post("/ops/notifications/test", async (_req, reply) => {
    try { return reply.status(202).send(envelope(true, app.operations.enqueueTestEmail(), null, "")); }
    catch (error) {
      if (error instanceof InvalidNotificationSettings) return reply.status(400).send(envelope(false, { message: error.message }, "INVALID_SETTINGS", ""));
      throw error;
    }
  });
  app.get("/ops/events", async (req, reply) => {
    const query = req.query as { after?: string; limit?: string };
    if ((query.after !== undefined && !/^\d+$/.test(query.after)) || (query.limit !== undefined && !/^\d+$/.test(query.limit))) {
      return reply.status(400).send(envelope(false, null, "INVALID_CURSOR", ""));
    }
    const after = query.after === undefined ? undefined : Number(query.after);
    const limit = query.limit === undefined ? 100 : Number(query.limit);
    if ((after !== undefined && !Number.isSafeInteger(after)) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      return reply.status(400).send(envelope(false, null, "INVALID_CURSOR", ""));
    }
    try { return envelope(true, app.operations.events(after, limit), null, ""); }
    catch (error) {
      if (error instanceof ExpiredOperationsCursor) return reply.status(410).send(envelope(false, { earliestCursor: error.earliestCursor, message: error.message }, "CURSOR_EXPIRED", ""));
      if (error instanceof FutureOperationsCursor) return reply.status(400).send(envelope(false, { latestCursor: error.latestCursor, message: error.message }, "INVALID_CURSOR", ""));
      throw error;
    }
  });
  app.post("/ops/events/:id/acknowledge", async (req, reply) => {
    const event = app.operations.acknowledge((req.params as { id: string }).id);
    if (!event) return reply.status(404).send(envelope(false, null, "NOT_FOUND", ""));
    return envelope(true, event, null, "");
  });
  app.get("/servers/:uuid/maintenance/updates", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    if (!app.configStore.load(uuid)) return reply.status(404).send(envelope(false, null, "NOT_FOUND", uuid));
    return envelope(true, app.maintenancePlanner.list(uuid), null, uuid);
  });
  app.post("/servers/:uuid/maintenance/check", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    if (!app.configStore.load(uuid)) return reply.status(404).send(envelope(false, null, "NOT_FOUND", uuid));
    return envelope(true, await app.maintenancePlanner.checkUpdates(uuid), null, uuid);
  });
  app.post("/servers/:uuid/maintenance/preview", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    if (!app.configStore.load(uuid)) return reply.status(404).send(envelope(false, null, "NOT_FOUND", uuid));
    const body = req.body as { keys?: string[] } | null;
    if (!body || Object.keys(body).some((key) => key !== "keys")) return reply.status(400).send(envelope(false, null, "INVALID_MAINTENANCE_REQUEST", uuid));
    try { return envelope(true, await app.maintenancePlanner.preview(uuid, body.keys ?? []), null, uuid); }
    catch (error) {
      if (error instanceof InvalidMaintenanceRequest) return reply.status(400).send(envelope(false, { message: error.message }, "INVALID_MAINTENANCE_REQUEST", uuid));
      throw error;
    }
  });
  app.get("/ops/maintenance/:id", async (req, reply) => {
    const checkpoint = app.operations.maintenance((req.params as { id: string }).id);
    if (!checkpoint) return reply.status(404).send(envelope(false, null, "NOT_FOUND", ""));
    const { recovery: _internal, ...publicResult } = checkpoint;
    return envelope(true, publicResult, null, "");
  });
  app.get("/ops/maintenance", async () => {
    const items = app.operations.checkpoints().map(({ recovery: _internal, ...item }) => item);
    return envelope(true, items, null, "");
  });
  // 执行／重试带幂等请求 ID；不接受写配置、重启等旁路参数，也不能绕过维护策略和锁。
  const requestId = (value: unknown): string | null => typeof value === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(value) ? value : null;
  app.post("/servers/:uuid/maintenance/execute", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    if (!app.configStore.load(uuid)) return reply.status(404).send(envelope(false, null, "NOT_FOUND", uuid));
    const body = req.body as { keys?: unknown; requestId?: unknown } | null;
    if (!body || Object.keys(body).some((key) => key !== "keys" && key !== "requestId") || !requestId(body.requestId)) {
      return reply.status(400).send(envelope(false, { message: "执行必须提供 keys 和 8—100 位幂等 requestId；写配置、重启等旁路参数不被接受" }, "INVALID_MAINTENANCE_REQUEST", uuid));
    }
    try {
      const { batch } = app.maintenanceExecutor.submit(uuid, body.keys as string[], body.requestId as string);
      return reply.status(202).send(envelope(true, { id: batch.id, state: batch.state }, null, uuid));
    } catch (error) {
      return reply.status(409).send(envelope(false, { message: (error as Error).message }, "MAINTENANCE_REJECTED", uuid));
    }
  });
  app.post("/ops/maintenance/:id/retry", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parent = app.operations.maintenance(id);
    if (!parent) return reply.status(404).send(envelope(false, null, "NOT_FOUND", ""));
    const body = req.body as { requestId?: unknown } | null;
    if (!body || Object.keys(body).some((key) => key !== "requestId") || !requestId(body.requestId)) {
      return reply.status(400).send(envelope(false, { message: "重试必须提供 8—100 位幂等 requestId" }, "INVALID_MAINTENANCE_REQUEST", ""));
    }
    try {
      const retry = (parent as { recovery?: { request?: { serverUuid?: string; keys?: string[] } } }).recovery?.request;
      if (!retry?.serverUuid || !retry.keys) return reply.status(400).send(envelope(false, { message: "该记录不是可重试的维护批次" }, "INVALID_MAINTENANCE_REQUEST", ""));
      const { batch } = app.maintenanceExecutor.submit(retry.serverUuid, retry.keys, body.requestId as string, id);
      return reply.status(202).send(envelope(true, { id: batch.id, state: batch.state }, null, "") );
    } catch (error) {
      return reply.status(409).send(envelope(false, { message: (error as Error).message }, "MAINTENANCE_REJECTED", ""));
    }
  });
  app.post("/ops/maintenance/:id/cancel", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!app.operations.maintenance(id)) return reply.status(404).send(envelope(false, null, "NOT_FOUND", ""));
    // 取消只撤销任务取消信号；已开始的停服/下载仍走有限恢复，不能把取消当成强停。
    return envelope(true, { cancelled: app.maintenanceExecutor.cancel(id) }, null, "");
  });
  app.post("/ops/maintenance/:id/resolve", async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { confirm?: unknown } | null;
    // 人工释放会解除实例/目录锁；必须显式确认现场已处理，不能被普通取消隐式触发。
    if (!body || Object.keys(body).some((key) => key !== "confirm") || body.confirm !== "manual_handled") {
      return reply.status(400).send(envelope(false, { message: "人工释放必须显式提交 confirm=manual_handled；确认现场已处理后才能解除维护锁" }, "INVALID_MAINTENANCE_REQUEST", ""));
    }
    try {
      const batch = app.maintenanceExecutor.resolveManual(id);
      if (!batch) return reply.status(404).send(envelope(false, null, "NOT_FOUND", ""));
      return envelope(true, { id: batch.id, state: batch.state, result: batch.result }, null, "");
    } catch (error) {
      return reply.status(409).send(envelope(false, { message: (error as Error).message }, "MAINTENANCE_REJECTED", ""));
    }
  });
}
