import { randomUUID } from "node:crypto";

export type TaskStatus = "Pending" | "Running" | "Succeeded" | "Failed";

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
    if (task) task.status = "Running";
  }

  appendStep(taskId: string, action: string, success: boolean, message: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.results.push({ action, success, message });
      task.log.push(`[${new Date().toISOString()}] ${action}: ${success ? "OK" : "FAIL"} - ${message}`);
    }
  }

  complete(taskId: string, error?: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = error ? "Failed" : "Succeeded";
      task.completedAt = new Date();
      task.error = error;
    }
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
        if (!r.success) break;
      } catch (e) {
        results.push({ action: cmd.action, success: false, message: e instanceof Error ? e.message : String(e) });
        break;
      }
    }
    const allOk = results.every((r) => r.success);
    return { success: allOk, message: allOk ? "任务完成" : "任务失败", results };
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
        try {
          const r = await executor(cmd);
          this.appendStep(taskId, cmd.action, r.success, r.message);
          if (!r.success) { this.complete(taskId, r.message); return; }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.appendStep(taskId, cmd.action, false, msg);
          this.complete(taskId, msg);
          return;
        }
      }
      this.complete(taskId);
    })();

    return taskId;
  }
}

export const asyncTaskManager = new AsyncTaskManager();
