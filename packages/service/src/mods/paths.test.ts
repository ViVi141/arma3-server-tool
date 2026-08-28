import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  expandScanTargets,
  isModDirectory,
  resolveEffectiveScanRoot,
  resolveWorkshopInstallRootFromScanPath,
  resolveWorkshopInstallRootFromScanPaths,
} from "./paths.js";
import { resolveConfiguredPath } from "../util/user-path.js";

describe("mod paths", () => {
  it("detects a mod directory by addons folder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-moddir-"));
    try {
      fs.mkdirSync(path.join(dir, "addons"));
      expect(isModDirectory(dir)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats a mod folder itself as one scan target", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-modroot-"));
    try {
      const modDir = path.join(root, "@cba");
      fs.mkdirSync(path.join(modDir, "addons"), { recursive: true });
      const targets = expandScanTargets([modDir], []);
      expect(targets).toHaveLength(1);
      expect(targets[0].modPath).toBe(modDir);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("scans workshop content subdirectories with addons", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-workshop-"));
    try {
      fs.mkdirSync(path.join(root, "450814997", "addons"), { recursive: true });
      fs.mkdirSync(path.join(root, "463939057", "addons"), { recursive: true });
      const targets = expandScanTargets([root], []);
      expect(targets).toHaveLength(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not treat steamapps as a mod when scanning workshop root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-steamroot-"));
    try {
      const contentPath = path.join(root, "steamapps", "workshop", "content", "107410");
      fs.mkdirSync(path.join(contentPath, "450814997", "addons"), { recursive: true });
      fs.mkdirSync(path.join(root, "steamapps", "config"), { recursive: true });

      expect(resolveEffectiveScanRoot(root)).toBe(contentPath);

      const targets = expandScanTargets([root], []);
      expect(targets).toHaveLength(1);
      expect(targets[0].modPath).toContain("450814997");
      expect(targets.some((item) => item.modPath.toLowerCase().endsWith("steamapps"))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("derives workshop install root from workshop content scan path", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-download-root-"));
    try {
      const contentPath = path.join(root, "steamapps", "workshop", "content", "107410");
      fs.mkdirSync(path.join(contentPath, "450814997", "addons"), { recursive: true });

      expect(resolveWorkshopInstallRootFromScanPath(contentPath)).toBe(root);
      expect(resolveWorkshopInstallRootFromScanPath(root)).toBe(root);
      expect(resolveWorkshopInstallRootFromScanPaths([contentPath])).toBe(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not derive workshop install root from a local mod directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-local-mod-"));
    try {
      const modDir = path.join(root, "@cba");
      fs.mkdirSync(path.join(modDir, "addons"), { recursive: true });
      expect(resolveWorkshopInstallRootFromScanPath(modDir)).toBeNull();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("expands tilde-prefixed scan paths for workshop root derivation", () => {
    const home = os.homedir();
    const root = fs.mkdtempSync(path.join(home, "a3st-tilde-test-"));
    try {
      const contentPath = path.join(root, "steamapps", "workshop", "content", "107410");
      fs.mkdirSync(path.join(contentPath, "450814997", "addons"), { recursive: true });
      const relativeFromHome = path.relative(home, contentPath).split(path.sep).join("/");
      const tildePath = "~/" + relativeFromHome;

      expect(resolveConfiguredPath(tildePath)).toBe(contentPath);
      expect(resolveWorkshopInstallRootFromScanPath(tildePath)).toBe(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("scans mods from tilde-prefixed workshop content path", () => {
    const home = os.homedir();
    const root = fs.mkdtempSync(path.join(home, "a3st-linux-scan-"));
    try {
      const contentPath = path.join(root, "steamapps", "workshop", "content", "107410");
      fs.mkdirSync(path.join(contentPath, "450814997", "addons"), { recursive: true });
      const relativeFromHome = path.relative(home, contentPath).split(path.sep).join("/");
      const tildePath = "~/" + relativeFromHome;

      const targets = expandScanTargets([tildePath], [{ modulePath: tildePath, remark: "" }]);
      expect(targets).toHaveLength(1);
      expect(targets[0].modPath).toContain("450814997");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not redirect when scan path is already workshop content", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-contentroot-"));
    try {
      const contentPath = path.join(root, "steamapps", "workshop", "content", "107410");
      fs.mkdirSync(path.join(contentPath, "450814997", "addons"), { recursive: true });
      fs.mkdirSync(path.join(contentPath, "463939057", "addons"), { recursive: true });
      // 模拟误创建的嵌套空目录
      fs.mkdirSync(
        path.join(contentPath, "steamapps", "workshop", "content", "107410"),
        { recursive: true }
      );

      expect(resolveEffectiveScanRoot(contentPath)).toBe(contentPath);

      const targets = expandScanTargets([contentPath], []);
      expect(targets).toHaveLength(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
