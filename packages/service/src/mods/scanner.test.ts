import { describe, it, expect } from "vitest";
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
  fs.writeFileSync(path.join(mod1, "addons", "cba.pbo.bisign"), "signed", "utf-8");
  fs.writeFileSync(path.join(mod1, "keys", "cba.bikey"), "fake", "utf-8");

  const mod2 = path.join(dir, "@ace");
  fs.mkdirSync(path.join(mod2, "addons"), { recursive: true });
  fs.writeFileSync(path.join(mod2, "meta.cpp"), 'publishedid = 463939057;\n', "utf-8");
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
      expect(cba!.bikeyLabel).toBe("未复制");
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
      expect(cba?.bikeyLabel).toBe("验证通过");
    } finally {
      fs.rmSync(modDir, { recursive: true, force: true });
      fs.rmSync(serverDir, { recursive: true, force: true });
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
});
