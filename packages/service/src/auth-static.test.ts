import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createService } from "./app.js";

describe("service auth for static UI", () => {
  let tmpDir = "";
  let app: Awaited<ReturnType<typeof createService>> | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    delete process.env.WEB_ROOT;
  });

  it("allows / without token when API token is configured", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-auth-"));
    const webDir = path.join(tmpDir, "web");
    fs.mkdirSync(webDir, { recursive: true });
    fs.writeFileSync(path.join(webDir, "index.html"), "<html><body>ui</body></html>", "utf-8");
    process.env.WEB_ROOT = webDir;

    app = await createService({
      port: 0,
      host: "127.0.0.1",
      dataDir: tmpDir,
      apiToken: "secret-token",
    });

    const addr = app.server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("expected TCP address");
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const ui = await fetch(`${baseUrl}/`);
    expect(ui.status).toBe(200);
    expect(await ui.text()).toContain("ui");

    const denied = await fetch(`${baseUrl}/api/v1/servers`);
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({ message: "Unauthorized" });

    const ok = await fetch(`${baseUrl}/api/v1/servers`, {
      headers: { Authorization: "Bearer secret-token" },
    });
    expect(ok.status).toBe(200);
  });
});
