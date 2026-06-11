import { Cron } from "croner";

export type CronJobHandler = () => void | Promise<void>;

export interface CronJobDef {
  name: string;
  schedule: string; // cron expression
  handler: CronJobHandler;
}

export class Scheduler {
  private jobs: Map<string, Cron> = new Map();

  add(def: CronJobDef): void {
    const job = new Cron(def.schedule, () => {
      def.handler();
    });

    this.jobs.set(def.name, job);
  }

  remove(name: string): void {
    const job = this.jobs.get(name);
    if (job) {
      job.stop();
      this.jobs.delete(name);
    }
  }

  clear(): void {
    for (const [name, job] of this.jobs) {
      job.stop();
    }
    this.jobs.clear();
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
