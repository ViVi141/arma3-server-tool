import { describe, it, expect, vi } from "vitest";
import { ModScanner } from "./scanner.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function createTempModDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-modtest-"));
  const mod1 = path.join(dir, "@cba");
  fs.mkdirSync(path.join(mod1, "addons"), { recursive: true });
  fs.mkdirSync(path.join(mod1, "keys"), { recursive: true });
  fs.writeFileSync(path.join(mod1, "meta.cpp"), 'publishedid = 450814997;\n', "utf-8");
  fs.writeFileSync(path.join(mod1, "addons", "cba.pbo"), "pbo");
  fs.writeFileSync(path.join(mod1, "addons", "cba.pbo.bisign"), "signed", "utf-8");
  fs.writeFileSync(path.join(mod1, "keys", "cba.bikey"), "fake", "utf-8");

  const mod2 = path.join(dir, "@ace");
  fs.mkdirSync(path.join(mod2, "addons"), { recursive: true });
  fs.writeFileSync(path.join(mod2, "meta.cpp"), 'publishedid = 463939057;\n', "utf-8");
  fs.writeFileSync(path.join(mod2, "addons", "ace.pbo"), "pbo");
  fs.writeFileSync(path.join(mod2, "addons", "ace.pbo.bisign"), "signed", "utf-8");

  return dir;
}

describe("ModScanner", () => {
  it("scans mods and extracts Workshop IDs", () => {
    const modDir = createTempModDir();
    try {
      const scanner = new ModScanner();
      const result = scanner.scan({
        modPaths: [modDir],
        enabledIds: [450814997],
        serverModIds: [450814997],
        clientModIds: [],
      });

      expect(result).toHaveLength(2);
      const cba = result.find((m) => m.workshopId === 450814997);
      expect(cba).toBeDefined();
      expect(cba!.name).toBe("@cba");
      expect(cba!.bikeyPresent).toBe(false);
      expect(cba!.bikeyStatus).toBe("not_copied");
      expect(cba!.bikeyLabel).toBe("公钥未部署");
      expect(cba!.enabled).toBe(true);
      const ace = result.find((m) => m.workshopId === 463939057);
      expect(ace).toBeDefined();
      expect(ace!.scanOrder).toBeLessThan(cba!.scanOrder);
      expect(ace!.bikeyPresent).toBe(false);
      expect(ace!.bikeyStatus).toBe("no_key");
      expect(ace!.enabled).toBe(false);
    } finally {
      fs.rmSync(modDir, { recursive: true, force: true });
    }
  });

  it("handles missing mod paths gracefully", () => {
    const scanner = new ModScanner();
    const result = scanner.scan({ modPaths: ["/does/not/exist"], enabledIds: [], serverModIds: [] });
    expect(result).toEqual([]);
  });

  it("recognizes workshop folders named by numeric id", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-workshop-id-"));
    try {
      const modDir = path.join(root, "450814997");
      fs.mkdirSync(path.join(modDir, "addons"), { recursive: true });
      const scanner = new ModScanner();
      const result = scanner.scan({
        modPaths: [root],
        enabledIds: [450814997],
        serverModIds: [450814997],
      });
      expect(result).toHaveLength(1);
      expect(result[0].workshopId).toBe(450814997);
      expect(result[0].enabled).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("includes explicit local mods", () => {
    const modDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-local-mod-"));
    try {
      fs.mkdirSync(path.join(modDir, "addons"), { recursive: true });
      const scanner = new ModScanner();
      const result = scanner.scan({
        modPaths: [],
        enabledIds: [],
        serverModIds: [],
        localMods: [{ path: modDir, name: "My Local Mod", enabled: true }],
        enabledLocalPaths: [modDir],
      });
      expect(result).toHaveLength(1);
      expect(result[0].isLocalMod).toBe(true);
      expect(result[0].name).toBe("My Local Mod");
      expect(result[0].enabled).toBe(true);
    } finally {
      fs.rmSync(modDir, { recursive: true, force: true });
    }
  });

  it("缺失的本地模组和角色路径仍可见，禁用状态不会被默认启用", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-missing-mod-"));
    try {
      const scanner = new ModScanner();
      const options = { modPaths: [], enabledIds: [], serverModIds: [],
        localMods: [{ path: path.join(root, "missing-local"), name: "丢失的本地模组", enabled: true },
          { path: path.join(root, "disabled"), enabled: false }],
        roleEntries: [{ path: path.join(root, "missing-workshop"), workshopId: 123456789, dirName: "missing-workshop", isClientMod: true, isServerMod: false, isHcMod: false }] };
      const rows = scanner.scan(options);
      expect(rows).toHaveLength(3);
      expect(rows.every((row) => row.bikeyStatus === "read_error" && !row.signatureEvidence?.canDeployKeys)).toBe(true);
      expect(rows.find((row) => row.name === "丢失的本地模组")?.enabled).toBe(true);
      expect(rows.find((row) => row.dirName === "disabled")?.enabled).toBe(false);
      expect(rows.find((row) => row.workshopId === 123456789)?.isClientMod).toBe(true);
      expect(scanner.summarizeBikeys(options)).toMatchObject({ enabled: 2, readError: 2, allValid: false });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("同 ID 的独立副本不继承另一条物理路径的角色，junction 别名去重", () => {
    const root = createTempModDir();
    try {
      const original = path.join(root, "@cba"); const copy = path.join(root, "@copy");
      const alias = path.join(root, "@alias");
      fs.cpSync(original, copy, { recursive: true });
      fs.symlinkSync(original, alias, process.platform === "win32" ? "junction" : "dir");
      const rows = new ModScanner().scan({ modPaths: [root], localMods: [{ path: alias }], enabledIds: [450814997], serverModIds: [450814997],
        roleEntries: [{ path: original, workshopId: 450814997, dirName: "@cba", isClientMod: true, isServerMod: false, isHcMod: false }] });
      const copies = rows.filter((row) => row.workshopId === 450814997);
      expect(copies).toHaveLength(2);
      expect(copies.find((row) => row.path === original)?.isClientMod).toBe(true);
      expect(copies.find((row) => row.path === copy)?.enabled).toBe(false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("calculates size including nested addon files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-mod-size-"));
    try {
      const modDir = path.join(root, "@size_test");
      fs.mkdirSync(path.join(modDir, "addons"), { recursive: true });
      fs.writeFileSync(path.join(modDir, "addons", "chunk.pbo"), Buffer.alloc(2048));
      const scanner = new ModScanner();
      const result = scanner.scan({ modPaths: [root], enabledIds: [], serverModIds: [] });
      expect(result).toHaveLength(1);
      expect(result[0].sizeBytes).toBe(2048);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("bikeyPresent is true only when validation fully passes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-bikey-valid-"));
    try {
      const serverDir = path.join(root, "server");
      const modPath = path.join(root, "mods", "@cba");
      fs.mkdirSync(path.join(modPath, "keys"), { recursive: true });
      fs.mkdirSync(path.join(modPath, "addons"), { recursive: true });
      fs.writeFileSync(path.join(modPath, "keys", "cba.bikey"), "fake");
      fs.writeFileSync(path.join(modPath, "addons", "cba.pbo"), "pbo");
      fs.writeFileSync(path.join(modPath, "addons", "cba.pbo.bisign"), "signed");
      fs.writeFileSync(path.join(modPath, "meta.cpp"), "publishedid = 450814997;\n", "utf-8");

      const scanner = new ModScanner();
      const pending = scanner.scan({
        modPaths: [path.join(root, "mods")],
        enabledIds: [450814997],
        serverModIds: [450814997],
        serverDir,
      });
      expect(pending[0]?.bikeyPresent).toBe(false);
      expect(pending[0]?.bikeyStatus).toBe("not_copied");

      const keysDir = path.join(serverDir, "Keys");
      fs.mkdirSync(keysDir, { recursive: true });
      fs.writeFileSync(path.join(keysDir, "cba-cba.bikey"), "fake");
      const ready = scanner.scan({
        modPaths: [path.join(root, "mods")],
        enabledIds: [450814997],
        serverModIds: [450814997],
        serverDir,
      });
      expect(ready[0]?.bikeyPresent).toBe(true);
      expect(ready[0]?.bikeyStatus).toBe("ready");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("marks bikey ready when renamed keys exist on server", () => {
    const modDir = createTempModDir();
    const serverDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-server-"));
    const keysDir = path.join(serverDir, "Keys");
    fs.mkdirSync(keysDir, { recursive: true });
    fs.writeFileSync(path.join(keysDir, "cba-cba.bikey"), "fake");
    try {
      const scanner = new ModScanner();
      const result = scanner.scan({
        modPaths: [modDir],
        enabledIds: [450814997],
        serverModIds: [450814997],
        serverDir,
      });
      const cba = result.find((m) => m.workshopId === 450814997);
      expect(cba?.bikeyStatus).toBe("ready");
      expect(cba?.bikeyLabel).toBe("文件检查就绪");
    } finally {
      fs.rmSync(modDir, { recursive: true, force: true });
      fs.rmSync(serverDir, { recursive: true, force: true });
    }
  });

  it("roleEntries override id lists when path matches", () => {
    const modDir = createTempModDir();
    try {
      const scanner = new ModScanner();
      const result = scanner.scan({
        modPaths: [modDir],
        enabledIds: [],
        serverModIds: [],
        clientModIds: [],
        roleEntries: [{
          path: path.join(modDir, "@cba"),
          dirName: "@cba",
          workshopId: 450814997,
          isClientMod: true,
          isServerMod: false,
          isHcMod: false,
        }],
      });
      const row = result.find((m) => m.workshopId === 450814997);
      expect(row?.enabled).toBe(true);
      expect(row?.isClientMod).toBe(true);
    } finally {
      fs.rmSync(modDir, { recursive: true, force: true });
    }
  });

  it("copyBikeysFromScanned copies keys for disabled mods too", () => {
    const modDir = createTempModDir();
    const serverDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-keys-all-"));
    try {
      const scanner = new ModScanner();
      const scanned = scanner.scan({
        modPaths: [modDir],
        enabledIds: [450814997],
        serverModIds: [],
        clientModIds: [],
      });
      expect(scanned.find((m) => m.workshopId === 450814997)?.enabled).toBe(false);

      const result = scanner.copyBikeysFromScanned(scanned, serverDir);
      expect(result.total).toBeGreaterThan(0);
      expect(result.copied).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(serverDir, "Keys", "cba-cba.bikey"))).toBe(true);
    } finally {
      fs.rmSync(modDir, { recursive: true, force: true });
      fs.rmSync(serverDir, { recursive: true, force: true });
    }
  });

  it("copyBikeys writes renamed .bikey files to server Keys dir", () => {
    const modDir = createTempModDir();
    const serverDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-keys-"));
    try {
      const scanner = new ModScanner();
      const result = scanner.copyBikeys([path.join(modDir, "@cba")], serverDir);
      expect(result.total).toBe(1);
      expect(result.copied).toBe(1);
      expect(fs.existsSync(path.join(serverDir, "Keys", "cba-cba.bikey"))).toBe(true);

      const second = scanner.copyBikeys([path.join(modDir, "@cba")], serverDir);
      expect(second.copied).toBe(0);
      expect(second.skipped).toBe(1);
    } finally {
      fs.rmSync(modDir, { recursive: true, force: true });
      fs.rmSync(serverDir, { recursive: true, force: true });
    }
  });

  it("PERF-2 default bikeyMode is shallow; explicit full still inspects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-mod-bikeymode-"));
    try {
      const modDir = path.join(root, "@mode_test");
      fs.mkdirSync(path.join(modDir, "addons"), { recursive: true });
      fs.writeFileSync(path.join(modDir, "addons", "data.pbo"), "pbo");
      fs.writeFileSync(path.join(modDir, "addons", "data.pbo.author.bisign"), "sign");
      fs.writeFileSync(path.join(modDir, "author.bikey"), "key");
      fs.writeFileSync(path.join(modDir, "meta.cpp"), "publishedid = 450814997;\n", "utf-8");

      const scanner = new ModScanner();
      const shallow = scanner.scan({
        modPaths: [root],
        enabledIds: [450814997],
        serverModIds: [450814997],
        skipSize: true,
      });
      expect(shallow[0].bikeyStatus).toBe("no_key");

      const full = scanner.scan({
        modPaths: [root],
        enabledIds: [450814997],
        serverModIds: [450814997],
        skipSize: true,
        bikeyMode: "full",
      });
      expect(full[0].bikeyStatus).toBe("not_copied");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("PERF-1 skipSize omits calculateSize and summarizeBikeys delegates with skipSize: true", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-mod-skipsize-"));
    try {
      const modDir = path.join(root, "@skip_test");
      fs.mkdirSync(path.join(modDir, "addons"), { recursive: true });
      fs.writeFileSync(path.join(modDir, "addons", "chunk.pbo"), Buffer.alloc(2048));
      fs.writeFileSync(path.join(modDir, "meta.cpp"), "publishedid = 450814997;\n", "utf-8");

      const scanner = new ModScanner();
      const calcSpy = vi.spyOn(
        scanner as unknown as { calculateSize: (p: string) => number },
        "calculateSize"
      );

      const skipped = scanner.scan({
        modPaths: [root],
        enabledIds: [450814997],
        serverModIds: [450814997],
        skipSize: true,
      });
      expect(skipped).toHaveLength(1);
      expect(skipped[0].sizeBytes).toBeUndefined();
      expect(calcSpy).not.toHaveBeenCalled();

      const summary = scanner.summarizeBikeys({
        modPaths: [root],
        enabledIds: [450814997],
        serverModIds: [450814997],
      });
      expect(summary.enabled).toBe(1);
      expect(calcSpy).not.toHaveBeenCalled();

      const full = scanner.scan({
        modPaths: [root],
        enabledIds: [],
        serverModIds: [],
      });
      // chunk.pbo (2048) + meta.cpp (25)
      expect(full[0].sizeBytes).toBe(2073);
      expect(calcSpy).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
