import { randomUUID } from "node:crypto";

export function envelope<T>(success: boolean, data: T, error: string | null, requestId: string) {
  return { success, data, error, requestId: requestId || randomUUID().slice(0, 12) };
}

export function parseQueryBool(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  const text = String(value);
  if (text === "true" || text === "1") {
    return true;
  }
  return false;
}

export function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  max = 10_000
): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}
