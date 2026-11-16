import * as path from "node:path";

export const MISSION_PBO_MAX_BYTES = 100 * 1024 * 1024;

/** 拒绝路径穿越与非法文件名，仅保留基名。 */
export function sanitizeUploadFileName(rawName: string): string {
  const base = path.basename(String(rawName ?? "").replace(/\\/g, "/")).trim();
  if (!base || base === "." || base === "..") {
    throw new Error("非法文件名");
  }
  if (/[<>:"|?*\x00-\x1f]/.test(base)) {
    throw new Error("文件名包含非法字符");
  }
  return base;
}

export function assertSafeTargetPath(targetDir: string, fileName: string): string {
  const safeName = sanitizeUploadFileName(fileName);
  const resolvedDir = path.resolve(targetDir);
  const fullPath = path.resolve(resolvedDir, safeName);
  const relative = path.relative(resolvedDir, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("目标路径越界");
  }
  return fullPath;
}

export function assertMissionPboFileName(fileName: string): string {
  const safe = sanitizeUploadFileName(fileName);
  if (!safe.toLowerCase().endsWith(".pbo")) {
    throw new Error("仅允许上传 .pbo 任务文件");
  }
  return safe;
}
