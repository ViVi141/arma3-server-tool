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
}

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
  return [];
}

export function lastTaskStep(data: TaskResponseLike | null | undefined): TaskStepLike | undefined {
  const steps = extractTaskSteps(data);
  if (!steps.length) {
    return undefined;
  }
  return steps[steps.length - 1];
}
