export function asConfigString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return "";
}
