export interface TaskStepLike {
  action?: string;
  success?: boolean;
  message?: string;
}

export interface TaskResponseLike {
  success?: boolean;
  message?: string;
  steps?: TaskStepLike[];
  results?: TaskStepLike[];
  status?: string;
  error?: string;
  data?: {
    steps?: TaskStepLike[];
    results?: TaskStepLike[];
    message?: string;
    success?: boolean;
  };
}

const GENERIC_TASK_MESSAGES = new Set(["任务完成", "任务失败"]);

export function extractTaskSteps(data: TaskResponseLike | null | undefined): TaskStepLike[] {
  if (!data) {
    return [];
  }
  if (data.steps?.length) {
    return data.steps;
  }
  if (data.results?.length) {
    return data.results;
  }
  if (data.data?.steps?.length) {
    return data.data.steps;
  }
  if (data.data?.results?.length) {
    return data.data.results;
  }
  return [];
}

export function lastTaskStep(data: TaskResponseLike | null | undefined): TaskStepLike | undefined {
  const steps = extractTaskSteps(data);
  if (!steps.length) {
    return undefined;
  }
  return steps[steps.length - 1];
}

/** 优先返回步骤 message，跳过「任务完成/失败」等泛化文案。 */
export function resolveTaskMessage(
  data: TaskResponseLike | null | undefined,
  fallback: string
): string {
  const step = lastTaskStep(data);
  if (step?.message) {
    return step.message;
  }
  const generic = data?.message?.trim();
  if (generic && !GENERIC_TASK_MESSAGES.has(generic)) {
    return generic;
  }
  return fallback;
}

export function taskSucceeded(data: TaskResponseLike | null | undefined): boolean {
  const steps = extractTaskSteps(data);
  if (steps.length > 0) {
    const last = steps[steps.length - 1];
    if (last.success === false) {
      return false;
    }
  }
  if (data?.success === false) {
    return false;
  }
  return true;
}

/** 异步 pollTask 结果：失败时优先 error，成功时解析步骤 message。 */
export function resolvePollTaskMessage(
  task: TaskResponseLike | null | undefined,
  fallback: string
): string {
  if (task?.status === "Failed") {
    if (task.error) {
      return task.error;
    }
    return fallback;
  }
  return resolveTaskMessage(task, fallback);
}

export function pollTaskSucceeded(task: TaskResponseLike | null | undefined): boolean {
  if (task?.status === "Failed") {
    return false;
  }
  return taskSucceeded(task);
}
