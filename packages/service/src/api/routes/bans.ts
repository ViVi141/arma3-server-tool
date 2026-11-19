import { loadLocalBans, saveLocalBans, type LocalBanEntry } from "../../bans/bans-service.js";
import { isSafeId } from "../../util/upload-safety.js";
import type { FastifyInstance } from "fastify";
import { envelope } from "./shared.js";

export function registerBansRoutes(app: FastifyInstance): void {
  // ===================== Bans =====================
  app.get("/servers/:uuid/bans", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config?.server?.serverDir) {
      reply.status(400);
      return envelope(false, { message: "未设置服务器目录" }, "NO_SERVER_DIR", uuid);
    }
    const bans = loadLocalBans(config.server.serverDir, uuid);
    return envelope(true, bans, null, uuid);
  });

  app.put("/servers/:uuid/bans", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config?.server?.serverDir) {
      reply.status(400);
      return envelope(false, { message: "未设置服务器目录" }, "NO_SERVER_DIR", uuid);
    }
    const body = req.body as LocalBanEntry[] | null;
    if (!Array.isArray(body)) {
      reply.status(400);
      return envelope(false, null, "INVALID_BAN", uuid);
    }
    const result = saveLocalBans(config.server.serverDir, uuid, body);
    if (!result.success) {
      reply.status(400);
      return envelope(false, { message: result.message }, "SAVE_BANS_FAILED", uuid);
    }
    return envelope(true, { message: result.message, count: body.length }, null, uuid);
  });

  app.get("/bans", async (req, reply) => {
    const query = req.query as { serverUuid?: string };
    if (!query.serverUuid) {
      reply.status(400);
      return envelope(false, { message: "请提供 serverUuid 参数" }, "MISSING_UUID", "");
    }
    if (!isSafeId(query.serverUuid)) {
      reply.status(400);
      return envelope(false, null, "INVALID_UUID", "");
    }
    const config = app.configStore.load(query.serverUuid);
    if (!config?.server?.serverDir) {
      reply.status(400);
      return envelope(false, { message: "未设置服务器目录" }, "NO_SERVER_DIR", query.serverUuid);
    }
    return envelope(true, loadLocalBans(config.server.serverDir, query.serverUuid), null, query.serverUuid);
  });

  app.post("/bans", async (req, reply) => {
    reply.status(400);
    return envelope(false, { message: "请使用 PUT /servers/:uuid/bans" }, "DEPRECATED", "");
  });

  app.delete("/bans/:guid", async (req, reply) => {
    const { guid } = req.params as { guid: string };
    reply.status(400);
    return envelope(false, { message: "请使用 PUT /servers/:uuid/bans" }, "DEPRECATED", guid);
  });
}
