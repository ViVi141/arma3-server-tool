import * as fs from "node:fs";
import * as path from "node:path";
import { resolveConfiguredPath } from "./user-path.js";

/** Windows 忽略大小写；Linux 路径保持大小写。空路径不解释成工作目录。 */
export function configuredPathKey(value: string): string {
  if (!value.trim()) return "";
  const resolved = path.resolve(resolveConfiguredPath(value));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/** 共享维护必须成功解析物理目录，不能用 Workshop ID 或猜测路径代替。 */
export function physicalDirectory(value: string): { path: string; key: string } {
  const configured = resolveConfiguredPath(value);
  if (!configured) throw new Error("目录路径为空");
  const real = fs.realpathSync(configured);
  if (!fs.statSync(real).isDirectory()) throw new Error("目标不是目录");
  return { path: real, key: configuredPathKey(real) };
}

/** 仅供列表/角色匹配：无法读取时保留配置路径，让扫描证据报告失败。 */
export function visiblePathKey(value: string): string {
  try { return physicalDirectory(value).key; }
  catch { return configuredPathKey(value); }
}
