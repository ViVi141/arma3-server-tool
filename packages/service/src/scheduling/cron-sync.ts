import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";
import { fetchRconPlayers, countOnlinePlayers } from "../rcon/helpers.js";
import { executeCronAction } from "./server-lifecycle.js";

export function clearCronJobsForServer(app: FastifyInstance, uuid: string): void {
  const prefix = `${uuid}-`;
  for (const job of app.scheduler.list()) {
    if (job.name.startsWith(prefix)) {
      app.scheduler.remove(job.name);
    }
  }
}

export function syncCronJobsForServer(
  app: FastifyInstance,
  uuid: string,
  config?: ServerConfigPackage | null
): { success: boolean; message: string; count: number } {
  const cfg = config ?? app.configStore.load(uuid);
  if (!cfg) {
    return { success: false, message: "未找到配置", count: 0 };
  }

  clearCronJobsForServer(app, uuid);
  let count = 0;
  const schedulerCfg = cfg.scheduler ?? {};

  if (schedulerCfg.restartCron) {
    app.scheduler.add({
      name: `${uuid}-restart`,
      schedule: schedulerCfg.restartCron,
      handler: async () => {
        await executeCronAction(app, uuid, "restart");
      },
    });
    count += 1;
  }

  if (schedulerCfg.monitoringCron) {
    app.scheduler.add({
      name: `${uuid}-monitoring`,
      schedule: schedulerCfg.monitoringCron,
      handler: async () => {
        const latest = app.configStore.load(uuid);
        if (!latest) {
          return;
        }
        const state = app.processManager.getState(uuid, latest);
        if (!state.isRunning) {
          return;
        }
        const online = await countOnlinePlayers(latest);
        if (online !== null) {
          app.monitorDb.recordStats(uuid, online);
          const players = await fetchRconPlayers(latest);
          for (const player of players) {
            if (player.guid) {
              app.monitorDb.recordPlayer({
                playerGuid: player.guid,
                playerName: player.name ?? player.guid,
                serverUuid: uuid,
                lastSeen: new Date().toISOString(),
              });
            }
          }
        }
      },
    });
    count += 1;
  }

  const cronJobs = schedulerCfg.cronJobs ?? {};
  for (const [taskId, job] of Object.entries(cronJobs)) {
    if (!job || !job.cron) {
      continue;
    }
    const enabled = job.enabled ?? job.status === 1;
    if (!enabled) {
      continue;
    }
    const actionText = String(job.actionText ?? job.action ?? "restart");
    app.scheduler.add({
      name: `${uuid}-cron-${taskId}`,
      schedule: job.cron,
      handler: async () => {
        await executeCronAction(app, uuid, actionText);
      },
    });
    count += 1;
  }

  return { success: true, message: `定时任务已同步 (${count} 个)`, count };
}

export function syncAllCronJobs(app: FastifyInstance): number {
  let total = 0;
  for (const server of app.configStore.listServers()) {
    const result = syncCronJobsForServer(app, server.uuid);
    if (result.success) {
      total += result.count;
    }
  }
  return total;
}
