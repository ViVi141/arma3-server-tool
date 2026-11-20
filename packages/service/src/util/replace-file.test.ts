import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

const { replaceFile } = await import("./replace-file.js");

function workspace(): { dir: string; target: string; temp: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-replace-"));
  const target = path.join(dir, "ops.db");
  const temp = path.join(dir, "ops.db.tmp");
  fs.writeFileSync(target, "old");
  fs.writeFileSync(temp, "new");
  return { dir, target, temp };
}

function failure(code: string): () => never {
  return () => {
    const error = new Error(`${code}: injected`) as NodeJS.ErrnoException;
    error.code = code;
    throw error;
  };
}

describe("replaceFile", () => {
  it("rename 成功时原位替换并移除临时文件", () => {
    const { dir, target, temp } = workspace();
    try {
      replaceFile(temp, target);
      expect(fs.readFileSync(target, "utf8")).toBe("new");
      expect(fs.existsSync(temp)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("Windows 瞬时占用（EPERM/EBUSY）时删除目标后重试，不丢失新内容", () => {
    for (const code of ["EPERM", "EBUSY"]) {
      const { dir, target, temp } = workspace();
      try {
        vi.mocked(fs.renameSync).mockImplementationOnce(failure(code));
        replaceFile(temp, target);
        expect(fs.readFileSync(target, "utf8")).toBe("new");
        expect(fs.existsSync(temp)).toBe(false);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("非瞬时错误直接抛出，保留旧目标与临时文件供调用方清理", () => {
    const { dir, target, temp } = workspace();
    try {
      vi.mocked(fs.renameSync).mockImplementationOnce(failure("EIO"));
      expect(() => replaceFile(temp, target)).toThrow("EIO: injected");
      expect(fs.readFileSync(target, "utf8")).toBe("old");
      expect(fs.readFileSync(temp, "utf8")).toBe("new");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
