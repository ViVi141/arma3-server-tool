import * as os from "node:os";
import * as path from "node:path";

/** Windows 盘符绝对路径（在非 Windows 上 path.isAbsolute 会判错）。 */
export function isWindowsDrivePath(input: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(input.trim());
}

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
  const expanded = expandUserPath(input);
  // 跨平台：勿把 "D:\foo" 在 Linux 上 resolve 成 cwd 相对路径。
  if (process.platform !== "win32" && isWindowsDrivePath(expanded)) {
    return expanded;
  }
  return path.resolve(expanded);
}
