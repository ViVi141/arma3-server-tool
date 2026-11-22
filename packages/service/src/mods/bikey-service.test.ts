import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  copyBikeysForMod, getCopiedBikeyFileName, getServerKeysDirectory, inspectMod,
  isModBikeyInspectionValid, isModBikeyValidationPassed, resolveModBikeyStatus,
} from "./bikey-service.js";

vi.mock("node:fs", async (importOriginal) => ({ ...await importOriginal<typeof import("node:fs")>() }));

let root: string;
let mod: string;
let server: string;
function file(relative: string, content = "data"): string {
  const target = path.join(mod, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}
function signedPbo(relative = "addons/data.pbo"): void {
  file(relative);
  file(`${relative}.author.bisign`, "sign");
}
function deploy(name = "TestMod-author.bikey", content = "key"): void {
  fs.mkdirSync(getServerKeysDirectory(server), { recursive: true });
  fs.writeFileSync(path.join(getServerKeysDirectory(server), name), content);
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-signature-"));
  mod = path.join(root, "@TestMod");
  server = path.join(root, "server");
  fs.mkdirSync(mod);
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("签名文件证据", () => {
  it("保留已有部署文件命名", () => {
    expect(getCopiedBikeyFileName("@TestMod", { fullPath: "", name: "author.bikey" })).toBe("TestMod-author.bikey");
  });
  it.each(["TestMod-author.bikey", "author.bikey"])("公钥内容相同才就绪：%s", (name) => {
    signedPbo();
    file("keys/author.bikey", "key");
    deploy(name);
    const result = inspectMod(mod, "@TestMod", server);
    expect(result.status).toBe("ready");
    expect(result.label).toBe("文件检查就绪");
    expect(result.evidence).toMatchObject({ pboCount: 1, signedPboCount: 1, deployedKeyCount: 1, cryptographicVerified: false });
    expect(isModBikeyInspectionValid(result)).toBe(true);
  });
  it.each(["author.bikey", "key/author.bikey", "keys/author.bikey", "Keys/nested/author.bikey"])("递归发现公钥：%s", (location) => {
    signedPbo("addons/nested/data.pbo");
    file(location, "key");
    const result = inspectMod(mod, "@TestMod", server);
    expect(result.status).toBe("not_copied");
    expect(result.evidence?.canDeployKeys).toBe(true);
  });
  it("未配置服务器路径时不提供部署操作", () => {
    signedPbo(); file("keys/author.bikey", "key");
    expect(inspectMod(mod, "@TestMod").evidence?.canDeployKeys).toBe(false);
  });
  it("每个 PBO 都要有对应签名，额外孤立签名不增加覆盖", () => {
    signedPbo(); file("addons/other.pbo"); file("addons/orphan.pbo.bisign");
    file("keys/author.bikey", "key"); deploy();
    const result = inspectMod(mod, "@TestMod", server);
    expect(result.status).toBe("partial");
    expect(result.evidence).toMatchObject({ pboCount: 2, signedPboCount: 1, missingPbos: [path.join("addons", "other.pbo")], canDeployKeys: false });
    expect(isModBikeyInspectionValid(result)).toBe(false);
  });
  it("其他目录或相近名称的签名不能覆盖该 PBO", () => {
    file("addons/data.pbo"); file("addons/data.pbo2.author.bisign"); file("other/data.pbo.author.bisign");
    expect(inspectMod(mod, "@TestMod", server).status).toBe("unsigned");
  });
  it("只有孤立签名而没有 PBO 是未知，不是就绪", () => {
    file("addons/data.pbo.bisign"); file("keys/author.bikey", "key"); deploy();
    expect(inspectMod(mod, "@TestMod", server).status).toBe("unknown");
  });
  it("有完整覆盖但没有公钥，需要从可信来源获取", () => {
    signedPbo();
    const result = inspectMod(mod, "@TestMod", server);
    expect(result.status).toBe("no_key");
    expect(result.evidence?.canDeployKeys).toBe(false);
  });
  it.each(["TestMod-author.bikey", "author.bikey"])("同名不同内容不是已部署：%s", (name) => {
    signedPbo(); file("keys/author.bikey", "new-key"); deploy(name, "old-key");
    const before = inspectMod(mod, "@TestMod", server);
    expect(before.status).toBe("key_mismatch");
    expect(before.evidence?.mismatchedKeys).toHaveLength(1);
    const result = copyBikeysForMod(mod, "@TestMod", server);
    expect(result).toMatchObject({ copied: 1, skipped: 0, failed: 0 });
    expect(inspectMod(mod, "@TestMod", server).status).toBe("ready");
    expect(copyBikeysForMod(mod, "@TestMod", server)).toMatchObject({ copied: 0, skipped: 1, failed: 0 });
  });
  it("路径不存在时报告读取失败，不当成未签名", () => {
    const result = inspectMod(path.join(root, "missing"), "missing", server);
    expect(result.status).toBe("read_error");
    expect(result.evidence?.readErrors.length).toBeGreaterThan(0);
  });
  it("目录读取失败会保留明确失败证据", () => {
    vi.spyOn(fs, "readdirSync").mockImplementation(() => { throw Object.assign(new Error("denied"), { code: "EACCES" }); });
    const result = inspectMod(mod, "@TestMod", server);
    expect(result.status).toBe("read_error");
    expect(result.evidence?.reason).toContain("EACCES");
  });
  it("服务器公钥读取失败不能当成内容匹配", () => {
    signedPbo(); file("keys/author.bikey", "key");
    fs.mkdirSync(path.join(getServerKeysDirectory(server), "TestMod-author.bikey"), { recursive: true });
    expect(inspectMod(mod, "@TestMod", server).status).toBe("read_error");
  });
  it("空公钥和目标名冲突均需人工处理", () => {
    signedPbo(); file("keys/author.bikey", "one"); file("other/author.bikey", "two");
    expect(inspectMod(mod, "@TestMod", server).status).toBe("read_error");
    expect(copyBikeysForMod(mod, "@TestMod", server).failed).toBe(1);
    expect(fs.existsSync(path.join(getServerKeysDirectory(server), "TestMod-author.bikey"))).toBe(false);
    file("other/author.bikey", "");
    expect(inspectMod(mod, "@TestMod", server).status).toBe("read_error");
  });
  it("符号链接循环不会无限递归或重复计数", () => {
    signedPbo(); file("keys/author.bikey", "key");
    fs.symlinkSync(mod, path.join(mod, "loop"), process.platform === "win32" ? "junction" : "dir");
    expect(inspectMod(mod, "@TestMod", server).evidence?.pboCount).toBe(1);
  });
  it("复制失败被计数而不是报告成功", () => {
    signedPbo(); file("keys/author.bikey", "key");
    vi.spyOn(fs, "copyFileSync").mockImplementation(() => { throw Object.assign(new Error("denied"), { code: "EACCES" }); });
    expect(copyBikeysForMod(mod, "@TestMod", server)).toMatchObject({ copied: 0, total: 1, failed: 1 });
  });
  it("旧接口仍可调用，但不会用缺失的源文件证明内容一致", () => {
    expect(resolveModBikeyStatus(false, [], "@TestMod").status).toBe("unsigned");
    expect(resolveModBikeyStatus(true, [], "@TestMod").status).toBe("no_key");
    deploy();
    expect(resolveModBikeyStatus(true, [{ fullPath: "", name: "author.bikey" }], "@TestMod", server).status).toBe("read_error");
    for (const status of ["partial", "unsigned", "read_error", "unknown", "key_mismatch", "not_copied", "no_key"] as const) {
      expect(isModBikeyValidationPassed(status)).toBe(false);
    }
  });
  it("浅扫与全扫在 addons+keys 布局下状态一致，且忽略无关大目录", () => {
    signedPbo();
    file("keys/author.bikey", "key");
    deploy();
    // 无关大目录：全扫会走进去，浅扫应跳过；状态仍应对齐。
    const junk = path.join(mod, "extra_assets");
    fs.mkdirSync(junk, { recursive: true });
    for (let i = 0; i < 30; i++) {
      fs.writeFileSync(path.join(junk, `blob-${i}.bin`), Buffer.alloc(64));
    }
    const shallow = inspectMod(mod, "@TestMod", server, { mode: "shallow" });
    const full = inspectMod(mod, "@TestMod", server, { mode: "full" });
    expect(shallow.status).toBe("ready");
    expect(full.status).toBe("ready");
    expect(shallow.evidence).toMatchObject({ pboCount: 1, signedPboCount: 1, deployedKeyCount: 1 });
    expect(full.evidence).toMatchObject({ pboCount: 1, signedPboCount: 1, deployedKeyCount: 1 });
  });
  it("浅扫不统计模组根下非 keys 路径的公钥，全扫仍能发现", () => {
    signedPbo();
    file("author.bikey", "key");
    expect(inspectMod(mod, "@TestMod", server, { mode: "shallow" }).status).toBe("no_key");
    expect(inspectMod(mod, "@TestMod", server, { mode: "full" }).status).toBe("not_copied");
  });
});
