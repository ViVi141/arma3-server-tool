import type { FastifyInstance } from "fastify";
import { envelope } from "./shared.js";

export function registerSnapshotsRoutes(app: FastifyInstance): void {
  // ===================== Snapshots =====================
  app.get("/servers/:uuid/snapshots", async (req) => {
    const { uuid } = req.params as { uuid: string };
    return envelope(true, app.snapshotStore.list(uuid), null, uuid);
  });

  app.post("/servers/:uuid/snapshots", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const body = req.body as { label?: string } | null;
    try {
      const id = app.snapshotStore.create(uuid, body?.label ?? "手动备份");
      return envelope(true, { id, message: "快照已创建" }, null, uuid);
    } catch (e: unknown) {
      req.log.error({ err: e, uuid }, "创建快照失败");
      return envelope(false, null, "SNAPSHOT_FAILED", uuid);
    }
  });

  app.post("/servers/:uuid/snapshots/:snapshotId/restore", async (req, reply) => {
    const { uuid, snapshotId } = req.params as { uuid: string; snapshotId: string };
    const ok = app.snapshotStore.restore(uuid, snapshotId);
    if (!ok) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    app.configStore.invalidateCache(uuid);
    return envelope(true, { message: "快照已恢复" }, null, uuid);
  });
}
