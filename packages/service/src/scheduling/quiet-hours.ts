/** 解析 HH:mm 为当日分钟数；非法返回 null。 */
export function parseHhMm(value: string | undefined | null): number | null {
  if (!value || !value.trim()) {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

/**
 * 判断 now 是否落在禁更窗 [start, end) 内。
 * 若 start >= end，视为跨午夜（例如 22:00–06:00）。
 * 任一侧未配置则视为无禁更窗。
 */
export function isInQuietHours(
  quietHoursStart: string | undefined,
  quietHoursEnd: string | undefined,
  now: Date = new Date(),
): boolean {
  const start = parseHhMm(quietHoursStart);
  const end = parseHhMm(quietHoursEnd);
  if (start === null || end === null) {
    return false;
  }
  if (start === end) {
    return false;
  }
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (start < end) {
    return minutes >= start && minutes < end;
  }
  // 跨午夜
  return minutes >= start || minutes < end;
}
