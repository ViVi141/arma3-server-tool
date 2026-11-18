import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { A3stClient, TaskStatus, TaskStep } from "@a3st/api-client";
import { useConnectionsStore } from "@/stores/connections";
import { resolvePollTaskMessage } from "@/utils/taskSteps";

export interface BackgroundTaskItem {
  taskId: string;
  connectionId: string;
  label: string;
  status: TaskStatus["status"];
  progressText: string;
  steps: TaskStep[];
  error: string | null;
  createdAt: number;
  completedAt?: number;
  cancelling?: boolean;
}

export interface M3SnackbarState {
  visible: boolean;
  message: string;
  variant: "default" | "success" | "error";
  actionLabel?: string;
  onAction?: () => void;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 900000;

export const useBackgroundTasksStore = defineStore("backgroundTasks", () => {
  const connections = useConnectionsStore();

  const tasks = ref<BackgroundTaskItem[]>([]);
  const activePollTokens = new Set<string>();
  // 同一 taskId 的在飞的轮询；用于阻止重复轮询（重复 startTask / 视图重进）
  const inFlightPolls = new Set<string>();
  const taskClients = new Map<string, A3stClient>();
  const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const snackbar = ref<M3SnackbarState>({
    visible: false,
    message: "",
    variant: "default",
  });
  let snackbarTimer: ReturnType<typeof setTimeout> | null = null;

  const activeTasks = computed(() => tasks.value);
  const runningCount = computed(
    () => tasks.value.filter((t) => t.status === "Pending" || t.status === "Running").length
  );
  const hasRunningTasks = computed(() => runningCount.value > 0);

  function dismissSnackbar(): void {
    if (snackbarTimer) {
      clearTimeout(snackbarTimer);
      snackbarTimer = null;
    }
    snackbar.value = {
      visible: false,
      message: "",
      variant: "default",
    };
  }

  function showSnackbar(
    message: string,
    options?: {
      variant?: "default" | "success" | "error";
      durationMs?: number;
      actionLabel?: string;
      onAction?: () => void;
    }
  ): void {
    if (snackbarTimer) {
      clearTimeout(snackbarTimer);
      snackbarTimer = null;
    }
    const variant = options?.variant ?? "default";
    snackbar.value = {
      visible: true,
      message,
      variant,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction,
    };
    const duration =
      options?.durationMs !== undefined
        ? options.durationMs
        : variant === "error"
          ? 6000
          : 4000;
    if (duration > 0) {
      snackbarTimer = setTimeout(() => {
        dismissSnackbar();
      }, duration);
    }
  }

  function clearDismissTimer(taskId: string): void {
    const timer = dismissTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      dismissTimers.delete(taskId);
    }
  }

  function scheduleAutoDismiss(taskId: string, delayMs: number): void {
    clearDismissTimer(taskId);
    dismissTimers.set(
      taskId,
      setTimeout(() => {
        dismissTask(taskId);
      }, delayMs)
    );
  }

  function dismissTask(taskId: string): void {
    activePollTokens.delete(taskId);
    taskClients.delete(taskId);
    clearDismissTimer(taskId);
    tasks.value = tasks.value.filter((t) => t.taskId !== taskId);
  }

  async function pollTask(
    taskId: string,
    client?: A3stClient | null,
    onComplete?: (task: TaskStatus) => void | Promise<void>
  ): Promise<TaskStatus | null> {
    if (inFlightPolls.has(taskId)) {
      // 已在轮询同一任务：再来一个循环只会让状态机互相覆盖
      return null;
    }
    const activeClient = client ?? taskClients.get(taskId) ?? connections.getClient();
    if (!activeClient) {
      return null;
    }
    taskClients.set(taskId, activeClient);
    activePollTokens.add(taskId);
    inFlightPolls.add(taskId);

    const started = Date.now();
    try {
      while (activePollTokens.has(taskId) && Date.now() - started < POLL_TIMEOUT_MS) {
        const item = tasks.value.find((t) => t.taskId === taskId);
        if (!item) {
          return null;
        }
        try {
          const res = await activeClient.getTask(taskId);
          if (!activePollTokens.has(taskId)) {
            return null;
          }
          if (!res.success || !res.data) {
            item.status = "Failed";
            item.completedAt = Date.now();
            item.error = "后台任务状态不可用（服务可能已重启）";
            item.progressText = item.error;
            showSnackbar(`${item.label}失败: ${item.error}`, { variant: "error" });
            return null;
          }

          const taskData = res.data;
          item.status = taskData.status;
          item.steps = taskData.steps ?? [];
          if (item.steps.length > 0) {
            const lastStep = item.steps[item.steps.length - 1];
            item.progressText = lastStep.message?.trim() || `步骤 ${item.steps.length} 执行中…`;
          } else if (taskData.status === "Pending") {
            item.progressText = "排队等待中…";
          } else if (taskData.status === "Running") {
            item.progressText = "正在执行…";
          }

          if (
            taskData.status === "Succeeded" ||
            taskData.status === "Failed" ||
            taskData.status === "Cancelled"
          ) {
            item.completedAt = Date.now();
            const msg = resolvePollTaskMessage(taskData, `${item.label}完成`);
            if (taskData.status === "Succeeded") {
              item.progressText = msg;
              try {
                await onComplete?.(taskData);
              } catch (err) {
                console.error("Background task onComplete error:", err);
              }
              showSnackbar(msg, { variant: "success" });
              scheduleAutoDismiss(taskId, 4000);
            } else if (taskData.status === "Cancelled") {
              item.progressText = msg || `${item.label}已取消`;
              try {
                await onComplete?.(taskData);
              } catch (err) {
                console.error("Background task onComplete error:", err);
              }
              showSnackbar(item.progressText, { variant: "default" });
              scheduleAutoDismiss(taskId, 3000);
            } else {
              item.error = taskData.error || msg;
              item.progressText = item.error;
              try {
                await onComplete?.(taskData);
              } catch (err) {
                console.error("Background task onComplete error:", err);
              }
              showSnackbar(`${item.label}失败: ${item.error}`, { variant: "error" });
            }
            return taskData;
          }
        } catch (err) {
          // Transient network hiccup: keep polling until timeout unless cancelled/dismissed
          console.warn("Background task poll transient error:", err);
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      if (activePollTokens.has(taskId)) {
        const item = tasks.value.find((t) => t.taskId === taskId);
        if (item && (item.status === "Pending" || item.status === "Running")) {
          item.status = "Failed";
          item.completedAt = Date.now();
          item.error = "后台任务轮询超时";
          item.progressText = item.error;
          showSnackbar(`${item.label}失败: ${item.error}`, { variant: "error" });
        }
      }
      return null;
    } finally {
      activePollTokens.delete(taskId);
      inFlightPolls.delete(taskId);
    }
  }

  async function startTask(
    label: string,
    submitFn: () => Promise<string>,
    onComplete?: (task: TaskStatus) => void | Promise<void>
  ): Promise<void> {
    // Capture connection context before awaiting submission so view/connection switches keep polling
    const connectionId = connections.activeId ?? "";
    const client = connections.getClient();
    const taskId = await submitFn();
    if (!taskId) {
      throw new Error("未获取到后台任务 ID");
    }

    const existing = tasks.value.find((t) => t.taskId === taskId);
    if (!existing) {
      tasks.value.push({
        taskId,
        connectionId,
        label,
        status: "Running",
        progressText: "已提交，正在后台执行…",
        steps: [],
        error: null,
        createdAt: Date.now(),
      });
    }
    if (client) {
      taskClients.set(taskId, client);
    }
    showSnackbar(`已开始后台任务：${label}`, { variant: "default", durationMs: 3000 });
    void pollTask(taskId, client, onComplete);
  }

  async function cancelTask(taskId: string): Promise<void> {
    const item = tasks.value.find((t) => t.taskId === taskId);
    if (item) {
      item.cancelling = true;
      item.progressText = "正在取消…";
    }
    const client = taskClients.get(taskId) ?? connections.getClient();
    if (!client) {
      return;
    }
    try {
      await client.cancelTask(taskId);
    } catch (err) {
      if (item) {
        item.cancelling = false;
      }
      showSnackbar(err instanceof Error ? err.message : "取消任务失败", { variant: "error" });
    }
  }

  function clearConnectionTasks(connectionId: string): void {
    const toRemove = tasks.value.filter((t) => t.connectionId === connectionId).map((t) => t.taskId);
    for (const id of toRemove) {
      dismissTask(id);
    }
  }

  return {
    tasks,
    activeTasks,
    runningCount,
    hasRunningTasks,
    snackbar,
    showSnackbar,
    dismissSnackbar,
    startTask,
    pollTask,
    cancelTask,
    dismissTask,
    clearConnectionTasks,
  };
});
