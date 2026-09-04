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

export class AsyncTaskManager {
  private tasks = new Map<string, AsyncTask>();
  private cancelledIds = new Set<string>();

  create(serverUuid: string, commands: { action: string; [key: string]: unknown }[]): string {
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
    task.log.push(`[${new Date().toISOString()}] cancel: 已取消`);
    return true;
  }

  appendStep(taskId: string, action: string, success: boolean, message: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.results.push({ action, success, message });
      let outcome = "FAIL";
      if (success) {
        outcome = "OK";
      }
      task.log.push(`[${new Date().toISOString()}] ${action}: ${outcome} - ${message}`);
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
