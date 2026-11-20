import { hasBundledMonitoringAssets } from "../../monitoring/deployment.js";
import { buildDailyHtmlReport, buildPlayersCsv, buildStatsCsv } from "../../monitoring/export.js";
import { ingestMonitoringMessage } from "../../monitoring/ingest.js";
import { fetchRconPlayers, collectRconPlayers } from "../../rcon/helpers.js";
import type { PlayerRecord } from "../../monitoring/db.js";
import type { FastifyInstance } from "fastify";
import { envelope, parsePositiveInt } from "./shared.js";

export function registerMonitoringRoutes(app: FastifyInstance): void {
  // ===================== Monitoring =====================
  app.get("/servers/:uuid/monitoring/summary", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const summary = app.monitorDb.getSummary(uuid);
    return envelope(true, summary, null, uuid);
  });

  app.get("/servers/:uuid/monitoring/stats", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { hours?: string };
    const hours = parsePositiveInt(query.hours, 24, 8760);
    const stats = app.monitorDb.getStats(uuid, hours);
    return envelope(true, { stats }, null, uuid);
  });

  app.get("/servers/:uuid/monitoring/players", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const players = app.monitorDb.listPlayers(uuid);
    return envelope(true, { players }, null, uuid);
  });

  app.post("/monitoring/collect", async () => {
    const servers = app.configStore.listServers();
    let count = 0;
    for (const s of servers) {
      const config = app.configStore.load(s.uuid);
      if (!config) {
        continue;
      }
      const state = await app.processManager.getState(s.uuid, config);
      if (!state.isRunning) {
        continue;
      }
      try {
        // One round-trip per tick: count and names come from the same response,
        // so background collection never opens two RCon logins.
        const snapshot = await collectRconPlayers(s.uuid, config);
        if (snapshot.ok) {
          const nowIso = new Date().toISOString();
          const playerRecords: PlayerRecord[] = snapshot.players
            .filter((player) => Boolean(player.guid))
            .map((player) => ({ playerGuid: player.guid, playerName: player.name ?? player.guid, serverUuid: s.uuid, lastSeen: nowIso }));
          app.monitorDb.recordCollectionTick(s.uuid, snapshot.players.length, playerRecords);
          count++;
        }
      } catch {
        // 人数未知时不写一条伪造的零人记录，也不影响其他实例采集。
      }
    }
    return envelope(true, { collected: count }, null, "");
  });

  app.post("/servers/:uuid/monitoring/ingest", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const body = req.body as { message?: string } | string | null;
    const message = typeof body === "string" ? body : body?.message;
    if (!message) {
      reply.status(400);
      return envelope(false, null, "INVALID_BODY", uuid);
    }
    ingestMonitoringMessage(app.monitorDb, uuid, message);
    return envelope(true, { message: "监控数据已入库" }, null, uuid);
  });

  app.post("/servers/:uuid/monitoring/sync-players", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const players = await fetchRconPlayers(config, uuid);
    const nowIso = new Date().toISOString();
    const playerRecords: PlayerRecord[] = players
      .filter((player) => Boolean(player.guid))
      .map((player) => ({
        playerGuid: player.guid,
        playerName: player.name ?? player.guid,
        serverUuid: uuid,
        lastSeen: nowIso,
      }));
    app.monitorDb.batchInsertPlayers(playerRecords);
    return envelope(true, { synced: players.length }, null, uuid);
  });

  app.get("/servers/:uuid/monitoring/export/html", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const stats = app.monitorDb.getStats(uuid, 24);
    const manifest = app.configStore.listServers().find((item) => item.uuid === uuid);
    const html = buildDailyHtmlReport(manifest?.configName ?? uuid, uuid, stats);
    reply.header("Content-Type", "text/html; charset=utf-8");
    return envelope(true, { html }, null, uuid);
  });

  app.get("/servers/:uuid/monitoring/export/csv", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { kind?: string };
    const kind = query.kind ?? "stats";
    if (kind === "players") {
      const csv = buildPlayersCsv(app.monitorDb.listPlayers(uuid));
      reply.header("Content-Type", "text/csv; charset=utf-8");
      return envelope(true, { csv }, null, uuid);
    }
    const csv = buildStatsCsv(app.monitorDb.getStats(uuid, 24));
    reply.header("Content-Type", "text/csv; charset=utf-8");
    return envelope(true, { csv }, null, uuid);
  });

  app.get("/servers/:uuid/monitoring/assets", async (req) => {
    const { uuid } = req.params as { uuid: string };
    return envelope(
      true,
      { hasBundledAssets: hasBundledMonitoringAssets(app.dataDir) },
      null,
      uuid
    );
  });
}
