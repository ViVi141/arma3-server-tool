import type { FastifyInstance } from "fastify";
import { isSafeId } from "../util/upload-safety.js";
import { envelope } from "./routes/shared.js";
import { registerServersRoutes } from "./routes/servers.js";
import { registerSteamCmdRoutes } from "./routes/steamcmd.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerModsRoutes } from "./routes/mods.js";
import { registerLogsRoutes } from "./routes/logs.js";
import { registerMonitoringRoutes } from "./routes/monitoring.js";
import { registerScheduleRoutes } from "./routes/schedule.js";
import { registerSnapshotsRoutes } from "./routes/snapshots.js";
import { registerBansRoutes } from "./routes/bans.js";
import { registerFilesRoutes } from "./routes/files.js";
import { registerTasksRoutes } from "./routes/tasks.js";
import { registerOperationsRoutes } from "./routes/operations.js";

export async function apiRoutes(app: FastifyInstance) {
  app.addHook("preValidation", async (req, reply) => {
    const params = req.params as { uuid?: unknown; snapshotId?: unknown } | undefined;
    if (params && params.uuid !== undefined && !isSafeId(params.uuid)) {
      reply.status(400);
      return reply.send(envelope(false, null, "INVALID_UUID", ""));
    }
    if (params && params.snapshotId !== undefined && !isSafeId(params.snapshotId)) {
      reply.status(400);
      return reply.send(
        envelope(false, null, "INVALID_SNAPSHOT_ID", String(params.uuid ?? ""))
      );
    }
  });

  registerServersRoutes(app);
  registerSteamCmdRoutes(app);
  registerSettingsRoutes(app);
  registerModsRoutes(app);
  registerLogsRoutes(app);
  registerMonitoringRoutes(app);
  registerScheduleRoutes(app);
  registerSnapshotsRoutes(app);
  registerBansRoutes(app);
  registerFilesRoutes(app);
  registerTasksRoutes(app);
  registerOperationsRoutes(app);
}
