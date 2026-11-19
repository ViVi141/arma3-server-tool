import { syncCronJobsForServer } from "../../scheduling/cron-sync.js";
import { isValidCron } from "../../scheduling/cron.js";
import { isSafeId } from "../../util/upload-safety.js";
import type { FastifyInstance } from "fastify";
import { envelope } from "./shared.js";

export function registerScheduleRoutes(app: FastifyInstance): void {
  // ===================== Scheduled Tasks =====================
  app.get("/schedule", async () => {
    return envelope(true, { jobs: app.scheduler.list() }, null, "");
  });

  app.post("/schedule/restart", async (req, reply) => {
    const body = req.body as { serverUuid?: string; cron?: string } | null;
    const uuid = body?.serverUuid;
    if (!uuid || !body?.cron) {
      reply.status(400);
      return envelope(false, null, "INVALID_REQUEST", "");
    }
    if (!isSafeId(uuid)) {
      reply.status(400);
      return envelope(false, null, "INVALID_UUID", "");
    }
    if (!isValidCron(body.cron)) {
      reply.status(400);
      return envelope(false, { message: `非法的 cron 表达式: ${body.cron}` }, "INVALID_CRON", uuid);
    }
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    // 写入配置并通过统一同步管道注册（作业名 ${uuid}-restart 与
    // clearCronJobsForServer 前缀一致，且走 executeCronAction 回写 processById）。
    config.scheduler = { ...config.scheduler, restartCron: body.cron };
    app.configStore.save(uuid, config);
    const sync = syncCronJobsForServer(app, uuid, config);
    return envelope(
      sync.success,
      { message: `定时重启已设置: ${body.cron}；${sync.message}` },
      sync.success ? null : "SYNC_FAILED",
      uuid
    );
  });
}
