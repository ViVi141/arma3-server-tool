import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createService } from "./app.js";

const originalAllowedOrigins = process.env.A3ST_ALLOWED_ORIGINS;

afterEach(() => {
  if (originalAllowedOrigins === undefined) {
    delete process.env.A3ST_ALLOWED_ORIGINS;
  } else {
    process.env.A3ST_ALLOWED_ORIGINS = originalAllowedOrigins;
  }
});

describe("Origin enforcement on /api/*", () => {
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

  async function startService(): Promise<string> {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-app-origin-"));
    app = await createService({ port: 0, host: "127.0.0.1", dataDir: tmpDir });
    const addr = app.server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("expected TCP address");
    }
    return `http://127.0.0.1:${addr.port}`;
  }

  it("rejects cross-origin API calls even without preflight", async () => {
    const baseUrl = await startService();
    const res = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { Origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("ORIGIN_NOT_ALLOWED");
    // 未获准的站点不应收到 CORS 头
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("keeps loopback origins working", async () => {
    const baseUrl = await startService();
    const res = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { Origin: "http://localhost:5173" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  });

  it("honors A3ST_ALLOWED_ORIGINS for remote UIs", async () => {
    process.env.A3ST_ALLOWED_ORIGINS = "https://panel.example";
    const baseUrl = await startService();
    const res = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { Origin: "https://panel.example" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://panel.example");
  });
});
