import { taskCommandsInvolveSteamCmd } from "../../task/manager.js";
import { isSafeId } from "../../util/upload-safety.js";
import type { FastifyInstance } from "fastify";
import { envelope } from "./shared.js";
import { executeCommandWithFollowUps } from "./task-commands.js";

export function registerTasksRoutes(app: FastifyInstance): void {
  // ===================== Task =====================
  app.post("/task", async (req, reply) => {
    const task = req.body as {
      taskId?: string;
      serverUuid?: string;
      serverName?: string;
      commands?: { action: string; [key: string]: unknown }[];
      async?: boolean;
      writeCfgAfter?: boolean;
      restartAfter?: boolean;
    };

    if (!task.serverUuid || !task.commands?.length) {
      reply.status(400);
      return envelope(false, null, "INVALID_TASK", "");
    }
    if (!isSafeId(task.serverUuid)) {
      reply.status(400);
      return envelope(false, null, "INVALID_UUID", "");
    }

    const uuid = task.serverUuid as string;
    const cmds = task.commands as { action: string; [key: string]: unknown }[];
    const taskDefaults = {
      writeCfgAfter: task.writeCfgAfter === true,
      restartAfter: task.restartAfter === true,
    };
    const executor = (cmd: { action: string; [key: string]: unknown }) =>
      executeCommandWithFollowUps(app, uuid, cmd, taskDefaults);

    if (task.async) {
      const taskId = await app.asyncTaskManager.runAsync(uuid, cmds, executor);
      return envelope(true, { taskId, status: "Running" }, null, uuid);
    }

    const result = await app.asyncTaskManager.runSync(uuid, cmds, executor);
    // 外层 success 如实反映执行结果（失败时仍返回 steps，供 UI 展示具体失败步骤）。
    return envelope(
      result.success,
      { ...result, steps: result.results },
      result.success ? null : "TASK_FAILED",
      task.taskId ?? uuid
    );
  });

  app.get("/tasks/:taskId", async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const task = app.asyncTaskManager.get(taskId);
    if (!task) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", taskId);
    }
    return envelope(true, {
      taskId: task.taskId,
      status: task.status,
      serverUuid: task.serverUuid,
      steps: task.results,
      error: task.error,
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString(),
    }, null, taskId);
  });

  app.delete("/tasks/:taskId", async (req, reply) => {
    const { taskId } = req.params as { taskId: string };
    const task = app.asyncTaskManager.get(taskId);
    if (!task) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", taskId);
    }
    const cancelled = app.asyncTaskManager.cancel(taskId);
    // 仅 SteamCMD 相关任务才 abort，避免取消无关任务时误杀正在跑的 SteamCMD。
    if (taskCommandsInvolveSteamCmd(task.commands)) {
      app.steamCmd.requestAbort();
    }
    const updated = app.asyncTaskManager.get(taskId);
    let message = "任务已结束";
    if (cancelled) {
      message = "任务已取消";
    }
    return envelope(
      true,
      { message, status: updated?.status ?? task.status },
      null,
      taskId
    );
  });
}
