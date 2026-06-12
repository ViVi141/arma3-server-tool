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
      expect(cba!.bikeyPresent).toBe(true);
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

  it("marks bikey ready when keys exist on server", () => {
    const modDir = createTempModDir();
    const serverDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-server-"));
    const keysDir = path.join(serverDir, "keys");
    fs.mkdirSync(keysDir, { recursive: true });
    fs.copyFileSync(path.join(modDir, "@cba", "keys", "cba.bikey"), path.join(keysDir, "cba.bikey"));
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
      expect(cba?.bikeyLabel).toBe("已复制");
    } finally {
      fs.rmSync(modDir, { recursive: true, force: true });
      fs.rmSync(serverDir, { recursive: true, force: true });
    }
  });

  it("copyBikeys copies .bikey files to server keys dir", () => {
    const modDir = createTempModDir();
    const keysDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-keys-"));
    try {
      const scanner = new ModScanner();
      const result = scanner.copyBikeys([path.join(modDir, "@cba")], keysDir);
      expect(result.total).toBe(1);
      expect(result.copied).toBe(1);
      expect(fs.existsSync(path.join(keysDir, "cba.bikey"))).toBe(true);

      // Second copy should result in 0 copied (already exists)
      const second = scanner.copyBikeys([path.join(modDir, "@cba")], keysDir);
      expect(second.copied).toBe(0);
    } finally {
      fs.rmSync(modDir, { recursive: true, force: true });
      fs.rmSync(keysDir, { recursive: true, force: true });
    }
  });
});
