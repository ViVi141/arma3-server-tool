import * as os from "node:os";
import * as path from "node:path";

/** 展开 Linux/macOS 常见的 ~/ 前缀路径。 */
export function expandUserPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "~") {
    return os.homedir();
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(os.homedir(), trimmed.slice(2));
  }
  return trimmed;
}

/** 将用户输入路径展开为绝对路径（含 ~ 与相对路径）。 */
export function resolveConfiguredPath(input: string): string {
  if (!input?.trim()) {
    return "";
  }
  return path.resolve(expandUserPath(input));
}
