import * as fs from "node:fs";

/** Windows 上目标文件被杀毒、索引服务或并发读者瞬时占用时 rename 会失败。 */
const TRANSIENT_CODES = new Set(["EPERM", "EACCES", "EEXIST", "EBUSY"]);

/**
 * 原子替换：先尝试 rename；命中 Windows 瞬时占用错误码时退化为删除目标后重试。
 *
 * POSIX 下 rename 是原子的；Windows 的 MoveFileEx 在目标被打开时直接拒绝，
 * 因此保留 delete + rename 的兜底路径，避免一次瞬时占用让配置/数据库写入整体失败。
 */
export function replaceFile(tempPath: string, targetPath: string): void {
  try {
    fs.renameSync(tempPath, targetPath);
    return;
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as NodeJS.ErrnoException).code ?? "")
        : "";
    if (!TRANSIENT_CODES.has(code)) {
      throw error;
    }
  }
  fs.rmSync(targetPath, { force: true });
  fs.renameSync(tempPath, targetPath);
}
