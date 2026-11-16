import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createService } from "./app.js";

describe("non-loopback bind requires API_TOKEN", () => {
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
  });

  it("rejects management APIs when bound publicly without token", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-pub-"));
    app = await createService({
      port: 0,
      host: "0.0.0.0",
      dataDir: tmpDir,
    });

    const addr = app.server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("expected TCP address");
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const health = await fetch(`${baseUrl}/api/v1/health`);
    expect(health.status).toBe(200);
    const body = await health.json() as {
      remoteAccessEnabled: boolean;
      authConfigured: boolean;
      bindHost: string;
    };
    expect(body.remoteAccessEnabled).toBe(true);
    expect(body.authConfigured).toBe(false);
    expect(body.bindHost).toBe("0.0.0.0");

    const denied = await fetch(`${baseUrl}/api/v1/servers`);
    expect(denied.status).toBe(401);
  });

  it("allows management APIs on loopback without token", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-local-"));
    app = await createService({
      port: 0,
      host: "127.0.0.1",
      dataDir: tmpDir,
    });

    const addr = app.server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("expected TCP address");
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;
    const health = await fetch(`${baseUrl}/api/v1/health`);
    const body = await health.json() as {
      remoteAccessEnabled: boolean;
      authConfigured: boolean;
    };
    expect(body.remoteAccessEnabled).toBe(false);
    expect(body.authConfigured).toBe(false);

    const ok = await fetch(`${baseUrl}/api/v1/servers`);
    expect(ok.status).toBe(200);
  });
});
