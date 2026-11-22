import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Writable } from "node:stream";
import { createService } from "./app.js";

describe("SEC-3 partial: Pino ?token= redaction, timingSafeEqual, and Electron/Capacitor CORS", () => {
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

  it("redacts ?token= from Pino logs, enforces timingSafeEqual without RangeError, and preserves Electron/Capacitor CORS", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-app-auth-"));
    const logLines: string[] = [];
    const logStream = new Writable({
      write(chunk, _enc, cb) {
        logLines.push(chunk.toString("utf8"));
        cb();
      },
    });

    const secret = "top-secret-token-value";
    app = await createService({
      port: 0,
      host: "127.0.0.1",
      dataDir: tmpDir,
      apiToken: secret,
      logStream,
    });

    const addr = app.server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("expected TCP address");
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // 1. ?token= query auth + Pino redaction
    const queryRes = await fetch(`${baseUrl}/api/v1/servers?token=${secret}`);
    expect(queryRes.status).toBe(200);

    // 2. Bearer valid / mismatched length / wrong same-length / x-api-key
    const bearerOk = await fetch(`${baseUrl}/api/v1/servers`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(bearerOk.status).toBe(200);

    const bearerShort = await fetch(`${baseUrl}/api/v1/servers`, {
      headers: { Authorization: "Bearer short" },
    });
    expect(bearerShort.status).toBe(401);

    const bearerWrong = await fetch(`${baseUrl}/api/v1/servers`, {
      headers: { Authorization: "Bearer top-secret-token-valuX" },
    });
    expect(bearerWrong.status).toBe(401);

    const apiKeyOk = await fetch(`${baseUrl}/api/v1/servers`, {
      headers: { "x-api-key": secret },
    });
    expect(apiKeyOk.status).toBe(200);

    // 3. Electron (null, 127.0.0.1) & Capacitor (http://localhost, capacitor://localhost) CORS
    const nullOrigin = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { Origin: "null" },
    });
    expect(nullOrigin.status).toBe(200);
    expect(nullOrigin.headers.get("access-control-allow-origin")).toBe("*");

    for (const origin of [
      "http://127.0.0.1:5173",
      "http://localhost",
      "capacitor://localhost",
    ]) {
      const res = await fetch(`${baseUrl}/api/v1/health`, {
        headers: { Origin: origin },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    }

    const combinedLogs = logLines.join("");
    expect(combinedLogs).toContain("token=***");
    expect(combinedLogs).not.toContain(secret);
  });

  it("rate-limits repeated authentication failures from the same client", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-app-auth-rl-"));
    app = await createService({
      port: 0,
      host: "127.0.0.1",
      dataDir: tmpDir,
      apiToken: "rate-limit-secret-token",
    });
    const addr = app.server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("expected TCP address");
    }
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    let lastStatus = 0;
    for (let i = 0; i < 25; i++) {
      const res = await fetch(`${baseUrl}/api/v1/servers`, {
        headers: { Authorization: "Bearer wrong-token-value" },
      });
      lastStatus = res.status;
      if (lastStatus === 429) {
        const body = (await res.json()) as { code?: string };
        expect(body.code).toBe("AUTH_RATE_LIMITED");
        break;
      }
    }
    expect(lastStatus).toBe(429);
  });
});
