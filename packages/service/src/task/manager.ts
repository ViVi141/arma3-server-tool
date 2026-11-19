import { randomUUID } from "node:crypto";

export type TaskStatus = "Pending" | "Running" | "Succeeded" | "Failed" | "Cancelled";

export interface AsyncTask {
  taskId: string;
  status: TaskStatus;
  serverUuid: string;
  commands: { action: string; [key: string]: unknown }[];
  results: { action: string; success: boolean; message: string }[];
  error?: string;
  createdAt: Date;
  completedAt?: Date;
  log: string[];
}

const STEAMCMD_TASK_ACTIONS = new Set([
  "download_mods",
  "update_server",
  "ensure_steamcmd",
  "install_dedicated_server",
  "import_mods_html",
  "stop_steamcmd",
]);

export function isSteamCmdTaskAction(action: string): boolean {
  return STEAMCMD_TASK_ACTIONS.has(action);
}

export function taskCommandsInvolveSteamCmd(
  commands: { action: string; [key: string]: unknown }[]
): boolean {
  return commands.some((cmd) => isSteamCmdTaskAction(String(cmd.action)));
}

export class AsyncTaskManager {
  private tasks = new Map<string, AsyncTask>();
  private cancelledIds = new Set<string>();
  /** 任务与日志上限：长跑服务里任务只增不减会持续吃内存。 */
  private static readonly MAX_TASKS = 100;
  private static readonly MAX_LOG_LINES = 500;
  private static readonly COMPLETED_TASK_TTL_MS = 60 * 60 * 1000;

  private isFinished(task: AsyncTask): boolean {
    return task.status === "Succeeded" || task.status === "Failed" || task.status === "Cancelled";
  }

  /** 清理过期/超额的历史任务（每次创建任务时顺带执行，无额外定时器）。 */
  private pruneTasks(): void {
    const now = Date.now();
    for (const [taskId, task] of this.tasks) {
      if (
        this.isFinished(task) &&
        task.completedAt &&
        now - task.completedAt.getTime() > AsyncTaskManager.COMPLETED_TASK_TTL_MS
      ) {
        this.tasks.delete(taskId);
        this.cancelledIds.delete(taskId);
      }
    }
    if (this.tasks.size <= AsyncTaskManager.MAX_TASKS) {
      return;
    }
    const finished = [...this.tasks.values()]
      .filter((task) => this.isFinished(task))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (const task of finished) {
      if (this.tasks.size <= AsyncTaskManager.MAX_TASKS) {
        break;
      }
      this.tasks.delete(task.taskId);
      this.cancelledIds.delete(task.taskId);
    }
  }

  private pushLog(task: AsyncTask, line: string): void {
    task.log.push(line);
    if (task.log.length > AsyncTaskManager.MAX_LOG_LINES) {
      task.log.splice(0, task.log.length - AsyncTaskManager.MAX_LOG_LINES);
    }
  }

  create(serverUuid: string, commands: { action: string; [key: string]: unknown }[]): string {
    this.pruneTasks();
    const taskId = randomUUID();
    this.tasks.set(taskId, {
      taskId,
      status: "Pending",
      serverUuid,
      commands,
      results: [],
      createdAt: new Date(),
      log: [],
    });
    return taskId;
  }

  get(taskId: string): AsyncTask | undefined {
    return this.tasks.get(taskId);
  }

  start(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === "Pending") {
      task.status = "Running";
    }
  }

  isCancelled(taskId: string): boolean {
    if (this.cancelledIds.has(taskId)) {
      return true;
    }
    const task = this.tasks.get(taskId);
    if (task && task.status === "Cancelled") {
      return true;
    }
    return false;
  }

  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }
    if (
      task.status === "Succeeded"
      || task.status === "Failed"
      || task.status === "Cancelled"
    ) {
      return false;
    }
    this.cancelledIds.add(taskId);
    task.status = "Cancelled";
    task.completedAt = new Date();
    task.error = "已取消";
    this.pushLog(task, `[${new Date().toISOString()}] cancel: 已取消`);
    return true;
  }

  /** 取消所有尚未结束的任务（用于停止 SteamCMD 时一并收尾）。 */
  cancelAllRunning(): string[] {
    const cancelled: string[] = [];
    for (const task of this.tasks.values()) {
      if (task.status === "Pending" || task.status === "Running") {
        if (this.cancel(task.taskId)) {
          cancelled.push(task.taskId);
        }
      }
    }
    return cancelled;
  }

  /**
   * 仅取消涉及 SteamCMD 的未完成任务（下载模组 / 更新服务器等），
   * 避免误取消无关长任务。
   */
  cancelSteamCmdRelatedRunning(): string[] {
    const cancelled: string[] = [];
    for (const task of this.tasks.values()) {
      if (task.status !== "Pending" && task.status !== "Running") {
        continue;
      }
      const related = task.commands.some((cmd) => isSteamCmdTaskAction(String(cmd.action)));
      if (!related) {
        continue;
      }
      if (this.cancel(task.taskId)) {
        cancelled.push(task.taskId);
      }
    }
    return cancelled;
  }

  appendStep(taskId: string, action: string, success: boolean, message: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.results.push({ action, success, message });
      let outcome = "FAIL";
      if (success) {
        outcome = "OK";
      }
      this.pushLog(task, `[${new Date().toISOString()}] ${action}: ${outcome} - ${message}`);
    }
  }

  complete(taskId: string, error?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }
    if (task.status === "Cancelled") {
      return;
    }
    if (error) {
      task.status = "Failed";
    } else {
      task.status = "Succeeded";
    }
    task.completedAt = new Date();
    task.error = error;
  }

  /** Run a task synchronously (for inline execution) */
  async runSync(
    serverUuid: string,
    commands: { action: string; [key: string]: unknown }[],
    executor: (cmd: { action: string; [key: string]: unknown }) => Promise<{ success: boolean; message: string }>
  ): Promise<{ success: boolean; message: string; results: { action: string; success: boolean; message: string }[] }> {
    const results: { action: string; success: boolean; message: string }[] = [];
    for (const cmd of commands) {
      try {
        const r = await executor(cmd);
        results.push({ action: cmd.action, success: r.success, message: r.message });
        if (!r.success) {
          break;
        }
      } catch (e) {
        results.push({
          action: cmd.action,
          success: false,
          message: e instanceof Error ? e.message : String(e),
        });
        break;
      }
    }
    const allOk = results.every((r) => r.success);
    if (allOk) {
      return { success: true, message: "任务完成", results };
    }
    return { success: false, message: "任务失败", results };
  }

  /** Schedule async execution */
  async runAsync(
    serverUuid: string,
    commands: { action: string; [key: string]: unknown }[],
    executor: (cmd: { action: string; [key: string]: unknown }) => Promise<{ success: boolean; message: string }>
  ): Promise<string> {
    const taskId = this.create(serverUuid, commands);
    this.start(taskId);

    // Run in background
    (async () => {
      for (const cmd of commands) {
        if (this.isCancelled(taskId)) {
          return;
        }
        try {
          const r = await executor(cmd);
          if (this.isCancelled(taskId)) {
            this.appendStep(taskId, cmd.action, false, "已取消");
            return;
          }
          this.appendStep(taskId, cmd.action, r.success, r.message);
          if (!r.success) {
            this.complete(taskId, r.message);
            return;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (this.isCancelled(taskId) || /已取消|aborted|cancel/i.test(msg)) {
            this.cancel(taskId);
            this.appendStep(taskId, cmd.action, false, "已取消");
            return;
          }
          this.appendStep(taskId, cmd.action, false, msg);
          this.complete(taskId, msg);
          return;
        }
      }
      if (!this.isCancelled(taskId)) {
        this.complete(taskId);
      }
    })();

    return taskId;
  }
}

export const asyncTaskManager = new AsyncTaskManager();
