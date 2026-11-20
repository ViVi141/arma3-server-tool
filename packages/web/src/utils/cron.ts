import { Cron } from "croner";

export interface CronStatus {
  /** 空表达式视为有效（该任务不会注册），但会给出说明。 */
  valid: boolean;
  /** 面向用户的说明：无效原因，或最近一次运行时间。 */
  text: string;
}

// 输入过程中的同值重复渲染会反复构造 Cron；按表达式缓存，避免每帧多次解析。
const cache = new Map<string, CronStatus>();
const MAX_CACHE = 200;

/**
 * 与后端调度器使用同一库（croner）校验，避免前端放行、后端在同步时跳过的表达式。
 * 预览按本机时区计算；实际执行以开服机时区为准。
 */
export function cronStatus(expr: string): CronStatus {
  const hit = cache.get(expr);
  if (hit) {
    return hit;
  }
  const status = describe(expr);
  if (cache.size >= MAX_CACHE) {
    cache.clear();
  }
  cache.set(expr, status);
  return status;
}

function describe(expr: string): CronStatus {
  const pattern = expr.trim();
  if (!pattern) {
    return { valid: true, text: "未设置：该任务不会注册到调度器" };
  }
  let job: Cron | null = null;
  try {
    // paused 避免预览时真的启动计时器。
    job = new Cron(pattern, { paused: true });
    const next = job.nextRuns(1)[0];
    if (!next) {
      return { valid: false, text: "表达式没有未来运行时间，请检查日期与星期" };
    }
    return { valid: true, text: `下次运行：${format(next)}` };
  } catch (error) {
    return { valid: false, text: translate(error) };
  } finally {
    job?.stop();
  }
}

function translate(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const invalidValue = /invalid value for (minute|hour|day|month|day-of-week|dayofweek|weekday)\s*:?\s*(.*)/i.exec(raw);
  if (invalidValue) {
    const field = {
      minute: "分钟",
      hour: "小时",
      day: "日",
      month: "月",
      "day-of-week": "星期",
      dayofweek: "星期",
      weekday: "星期",
    }[invalidValue[1].toLowerCase()] ?? invalidValue[1];
    return `表达式无效：${field}取值 ${invalidValue[2]} 超出范围`;
  }
  if (/invalid configuration format/i.test(raw)) {
    return "表达式无效：需要 5 段（分 时 日 月 周）";
  }
  return `表达式无效：${raw || "无法解析"}`;
}

function format(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
