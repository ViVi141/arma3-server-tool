import { Cron } from "croner";

export type CronJobHandler = () => void | Promise<void>;

export interface CronJobDef {
  name: string;
  schedule: string; // cron expression
  handler: CronJobHandler;
}

/** Validate a cron expression without scheduling anything. */
export function isValidCron(schedule: string): boolean {
  if (!schedule || !schedule.trim()) {
    return false;
  }
  try {
    // Constructor throws synchronously on invalid patterns; stop() cancels the
    // freshly scheduled tick so the probe never fires.
    const probe = new Cron(schedule);
    probe.stop();
    return true;
  } catch {
    return false;
  }
}

export class Scheduler {
  private jobs: Map<string, Cron> = new Map();
  private schedules: Map<string, string> = new Map();

  /**
   * Register a job. Invalid expressions are skipped (returns false) instead of
   * throwing — a single bad cron in a config package must never crash the
   * whole service on startup.
   */
  add(def: CronJobDef): boolean {
    if (!isValidCron(def.schedule)) {
      this.remove(def.name);
      return false;
    }
    this.remove(def.name);
    try {
      const job = new Cron(def.schedule, () => {
        // Handler failures must not kill the scheduler or leak unhandled rejections.
        Promise.resolve()
          .then(() => def.handler())
          .catch(() => undefined);
      });
      this.jobs.set(def.name, job);
      this.schedules.set(def.name, def.schedule);
      return true;
    } catch {
      this.remove(def.name);
      return false;
    }
  }

  remove(name: string): void {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      this.jobs.delete(name);
      this.schedules.delete(name);
    }
  }

  clear(): void {
    for (const [, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
    this.schedules.clear();
  }

  list(): { name: string; schedule: string }[] {
    const items: { name: string; schedule: string }[] = [];
    for (const [name, schedule] of this.schedules.entries()) {
      items.push({ name, schedule });
    }
    return items;
  }
}

// Example cron patterns
export const CRON_EVERY_5_MIN = "*/5 * * * *";
export const CRON_EVERY_HOUR = "0 * * * *";
export const CRON_DAILY_3AM = "0 3 * * *";
export const CRON_SERVER_RESTART = stringifyServerRestart(6, 18); // 06:00 & 18:00

/**
 * Generate a daily-restart cron expression for the given HOURS (fired at
 * minute 0 of each hour). Fields are "minute hour dom mon dow".
 * e.g. stringifyServerRestart(6, 18) => "0 6,18 * * *" (06:00 and 18:00 daily).
 */
export function stringifyServerRestart(...hours: number[]): string {
  const normalized = hours
    .map((h) => ((Math.trunc(h) % 24) + 24) % 24)
    .filter((h) => Number.isFinite(h));
  const unique = Array.from(new Set(normalized)).sort((a, b) => a - b);
  return `0 ${unique.join(",")} * * *`;
}
