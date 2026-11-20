import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { once } from "node:events";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { collectProcessRuntimes, parseProcArgv } from "./runtime.js";

describe("真实进程维护范围证据", () => {
  it("Linux argv 保留 NUL 分隔、空参数和含空格路径，不先拼接为字符串", () => {
    expect(parseProcArgv(Buffer.from("/bin/server\0-mod=/mods/with space;/mods/two\0\0-name=abc\0"))).toEqual(["/bin/server", "-mod=/mods/with space;/mods/two", "", "-name=abc"]);
    expect(() => parseProcArgv(Buffer.from("incomplete"))).toThrow("不完整");
  });
  it("读取本机子进程实际 cwd、argv 和启动会话，不使用配置猜测", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "a3st runtime 中文 "));
    const args = ["-e", "setInterval(() => {}, 1000)", "--", "-mod=with space;another", "-name=runtime-test"];
    const child = spawn(process.execPath, args, { cwd: dir, stdio: "ignore" });
    try {
      await once(child, "spawn");
      const first = await collectProcessRuntimes([], [child.pid!]);
      expect(first.complete).toBe(true); expect(first.unknownPids).toEqual([]);
      expect(first.processes).toHaveLength(1);
      expect(first.processes[0].args).toEqual(args);
      expect(await fs.realpath(first.processes[0].workingDirectory)).toBe(await fs.realpath(dir));
      expect(await fs.realpath(first.processes[0].executable)).toBe(await fs.realpath(process.execPath));
      const second = await collectProcessRuntimes([], [child.pid!]);
      expect(second.processes[0].session).toBe(first.processes[0].session);
    } finally {
      const exit = once(child, "exit"); child.kill(); await exit;
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});
