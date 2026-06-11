import { describe, it, expect } from "vitest";
import { ModScanner } from "./scanner.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function createTempModDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-modtest-"));
  // Create fake mods
  const mod1 = path.join(dir, "@cba");
  fs.mkdirSync(path.join(mod1, "keys"), { recursive: true });
  fs.writeFileSync(path.join(mod1, "meta.cpp"), 'publishedid = 450814997;\n', "utf-8");
  fs.writeFileSync(path.join(mod1, "keys", "cba.bikey"), "fake", "utf-8");

  const mod2 = path.join(dir, "@ace");
  fs.mkdirSync(mod2, { recursive: true });
  fs.writeFileSync(path.join(mod2, "meta.cpp"), 'publishedid = 463939057;\n', "utf-8");

  return dir;
}

describe("ModScanner", () => {
  it("scans mods and extracts Workshop IDs", () => {
    const modDir = createTempModDir();
    try {
      const scanner = new ModScanner();
      const result = scanner.scan({ modPaths: [modDir], enabledIds: [450814997], serverModIds: [] });

      expect(result).toHaveLength(2);
      const cba = result.find((m) => m.workshopId === 450814997);
      expect(cba).toBeDefined();
      expect(cba!.name).toBe("@cba");
      expect(cba!.bikeyPresent).toBe(true);
      expect(cba!.enabled).toBe(true);

      const ace = result.find((m) => m.workshopId === 463939057);
      expect(ace).toBeDefined();
      expect(ace!.bikeyPresent).toBe(false);
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
