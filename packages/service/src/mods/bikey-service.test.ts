import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  copyBikeysForMod,
  getCopiedBikeyFileName,
  getServerKeysDirectory,
  inspectMod,
  isModBikeyInspectionValid,
  isModBikeyValidationPassed,
  resolveModBikeyStatus,
} from "./bikey-service.js";

describe("BikeyService parity with legacy C#", () => {
  it("GetCopiedBikeyFileName matches @TestMod + author.bikey", () => {
    const name = getCopiedBikeyFileName("@TestMod", { fullPath: "", name: "author.bikey" });
    expect(name).toBe("TestMod-author.bikey");
  });

  it("InspectMod reports copied when renamed bikey exists on server", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-bikey-renamed-"));
    try {
      const serverDir = path.join(root, "server");
      const modPath = path.join(root, "mods", "@TestMod");
      fs.mkdirSync(path.join(modPath, "keys"), { recursive: true });
      fs.writeFileSync(path.join(modPath, "keys", "author.bikey"), "bikey");
      fs.writeFileSync(path.join(modPath, "data.pbo.bisign"), "sign");

      const keysDir = getServerKeysDirectory(serverDir);
      fs.mkdirSync(keysDir, { recursive: true });
      fs.writeFileSync(path.join(keysDir, "TestMod-author.bikey"), "bikey");

      const inspection = inspectMod(modPath, "@TestMod", serverDir);
      expect(inspection.hasBisign).toBe(true);
      expect(inspection.hasBikeyInMod).toBe(true);
      expect(inspection.status).toBe("ready");
      expect(inspection.allCopiedToServer).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("InspectMod reports copied when original bikey filename exists on server", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-bikey-original-"));
    try {
      const serverDir = path.join(root, "server");
      const modPath = path.join(root, "mods", "@Legacy");
      fs.mkdirSync(path.join(modPath, "keys"), { recursive: true });
      fs.writeFileSync(path.join(modPath, "keys", "author.bikey"), "bikey");
      fs.writeFileSync(path.join(modPath, "legacy.pbo.bisign"), "sign");

      const keysDir = getServerKeysDirectory(serverDir);
      fs.mkdirSync(keysDir, { recursive: true });
      fs.writeFileSync(path.join(keysDir, "author.bikey"), "bikey");

      const inspection = inspectMod(modPath, "@Legacy", serverDir);
      expect(inspection.status).toBe("ready");
      expect(inspection.allCopiedToServer).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds bikeys anywhere under mod directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-bikey-root-"));
    try {
      const modPath = path.join(root, "mods", "1154375007");
      fs.mkdirSync(path.join(modPath, "addons"), { recursive: true });
      fs.writeFileSync(path.join(modPath, "pook_v2.bikey"), "bikey");
      fs.writeFileSync(path.join(modPath, "addons", "mod.pbo.bisign"), "sign");

      const inspection = inspectMod(modPath, "1154375007", undefined);
      expect(inspection.hasBikeyInMod).toBe(true);
      expect(inspection.status).toBe("not_copied");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds bikeys in key folder (singular)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-bikey-singular-"));
    try {
      const modPath = path.join(root, "mods", "1556296528");
      fs.mkdirSync(path.join(modPath, "key"), { recursive: true });
      fs.mkdirSync(path.join(modPath, "addons"), { recursive: true });
      fs.writeFileSync(path.join(modPath, "key", "horror_mod1.bikey"), "bikey");
      fs.writeFileSync(path.join(modPath, "addons", "mod.pbo.bisign"), "sign");

      const inspection = inspectMod(modPath, "1556296528", undefined);
      expect(inspection.hasBikeyInMod).toBe(true);
      expect(inspection.status).toBe("not_copied");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("finds bikeys under keys folder and elsewhere in mod tree", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-bikey-keys-only-"));
    try {
      const modPath = path.join(root, "mods", "@Alpha");
      fs.mkdirSync(path.join(modPath, "keys"), { recursive: true });
      fs.mkdirSync(path.join(modPath, "addons"), { recursive: true });
      fs.writeFileSync(path.join(modPath, "keys", "author.bikey"), "bikey");
      fs.writeFileSync(path.join(modPath, "addons", "stray.bikey"), "ignore");
      fs.writeFileSync(path.join(modPath, "addons", "alpha.pbo.bisign"), "sign");

      const inspection = inspectMod(modPath, "@Alpha", undefined);
      expect(inspection.hasBikeyInMod).toBe(true);
      expect(inspection.status).toBe("not_copied");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports no_key for nested bisign when keys folder has no bikey", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-bikey-nested-"));
    try {
      const modPath = path.join(root, "mods", "450814997");
      fs.mkdirSync(path.join(modPath, "addons", "cba"), { recursive: true });
      fs.mkdirSync(path.join(modPath, "keys"), { recursive: true });
      fs.writeFileSync(path.join(modPath, "addons", "cba", "cba.pbo.bisign"), "sign");

      const inspection = inspectMod(modPath, "450814997", undefined);
      expect(inspection.hasBisign).toBe(true);
      expect(inspection.hasBikeyInMod).toBe(false);
      expect(inspection.status).toBe("no_key");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("isModBikeyValidationPassed accepts only ready status", () => {
    expect(isModBikeyValidationPassed("ready")).toBe(true);
    expect(isModBikeyValidationPassed("not_copied")).toBe(false);
    expect(isModBikeyValidationPassed("no_key")).toBe(false);
    expect(isModBikeyValidationPassed("unsigned")).toBe(false);
  });

  it("isModBikeyInspectionValid requires bisign, key, and server copy", () => {
    expect(
      isModBikeyInspectionValid({
        hasBisign: true,
        hasBikeyInMod: true,
        allCopiedToServer: true,
        status: "ready",
        label: "验证通过",
      }),
    ).toBe(true);
    expect(
      isModBikeyInspectionValid({
        hasBisign: true,
        hasBikeyInMod: true,
        allCopiedToServer: false,
        status: "not_copied",
        label: "未复制",
      }),
    ).toBe(false);
  });

  it("resolveModBikeyStatus covers four mutually exclusive states", () => {
    expect(resolveModBikeyStatus(false, [], "@Mod").status).toBe("unsigned");
    expect(resolveModBikeyStatus(true, [], "@Mod").status).toBe("no_key");
    expect(resolveModBikeyStatus(true, [{ fullPath: "", name: "a.bikey" }], "@Mod").status).toBe(
      "not_copied",
    );

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-bikey-four-"));
    try {
      const serverDir = path.join(root, "server");
      const keysDir = getServerKeysDirectory(serverDir);
      fs.mkdirSync(keysDir, { recursive: true });
      fs.writeFileSync(path.join(keysDir, "Mod-a.bikey"), "bikey");
      expect(
        resolveModBikeyStatus(
          true,
          [{ fullPath: "", name: "a.bikey" }],
          "@Mod",
          serverDir,
        ).status,
      ).toBe("ready");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("CopyBikeysForMod writes renamed file into Keys directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-bikey-copy-"));
    try {
      const serverDir = path.join(root, "server");
      const modPath = path.join(root, "mods", "@TestMod");
      fs.mkdirSync(path.join(modPath, "keys"), { recursive: true });
      fs.mkdirSync(path.join(modPath, "addons"), { recursive: true });
      fs.writeFileSync(path.join(modPath, "keys", "author.bikey"), "bikey");
      fs.writeFileSync(path.join(modPath, "addons", "test.pbo.bisign"), "sign");

      const result = copyBikeysForMod(modPath, "@TestMod", serverDir);
      expect(result.total).toBe(1);
      expect(result.copied).toBe(1);
      expect(fs.existsSync(path.join(getServerKeysDirectory(serverDir), "TestMod-author.bikey"))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
