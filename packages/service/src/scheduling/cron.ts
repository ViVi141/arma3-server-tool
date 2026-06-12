import { Cron } from "croner";

export type CronJobHandler = () => void | Promise<void>;

export interface CronJobDef {
  name: string;
  schedule: string; // cron expression
  handler: CronJobHandler;
}

export class Scheduler {
  private jobs: Map<string, Cron> = new Map();
  private schedules: Map<string, string> = new Map();

  add(def: CronJobDef): void {
    this.remove(def.name);
    const job = new Cron(def.schedule, () => {
      def.handler();
    });

    this.jobs.set(def.name, job);
    this.schedules.set(def.name, def.schedule);
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

/** Generate cron expressions for daily restart at given hours */
export function stringifyServerRestart(...hours: number[]): string {
  return `${hours.join(",").replace(/\d+/g, (h) => `${(+h % 24)}`)} 0 * * *`;
}
