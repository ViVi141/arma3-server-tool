import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { SERVICE_VERSION } from "./version.js";

describe("SERVICE_VERSION", () => {
  it("reports a real version instead of a hardcoded literal", () => {
    expect(SERVICE_VERSION).not.toBe("0.0.0");
    expect(SERVICE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("matches packages/service/package.json when A3ST_VERSION is unset", () => {
    if (process.env.A3ST_VERSION) {
      // 环境变量显式覆盖时以环境变量为准（桌面端会注入 app.getVersion()）。
      expect(SERVICE_VERSION).toBe(process.env.A3ST_VERSION);
      return;
    }
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    expect(SERVICE_VERSION).toBe(pkg.version);
  });
});
