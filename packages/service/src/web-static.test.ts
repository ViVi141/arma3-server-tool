import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerWebStatic, resolveWebRoot } from "./web-static.js";

const created: string[] = [];

function makeWebRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-web-"));
  created.push(dir);
  fs.writeFileSync(path.join(dir, "index.html"), "<html>ok</html>", "utf8");
  fs.mkdirSync(path.join(dir, "assets"));
  fs.writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)", "utf8");
  return dir;
}

afterEach(() => {
  delete process.env.WEB_ROOT;
  for (const dir of created) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  created.length = 0;
});

describe("resolveWebRoot", () => {
  it("uses WEB_ROOT when index.html exists", () => {
    const dir = makeWebRoot();
    process.env.WEB_ROOT = dir;
    expect(resolveWebRoot()).toBe(dir);
  });

  it("returns null when WEB_ROOT is missing index", () => {
    process.env.WEB_ROOT = os.tmpdir();
    expect(resolveWebRoot()).toBeNull();
  });
});

describe("registerWebStatic", () => {
  it("serves index and hashed assets, keeps API 404 JSON", async () => {
    const dir = makeWebRoot();
    const app = Fastify({ logger: false });
    app.get("/api/v1/health", async () => ({ success: true }));
    await registerWebStatic(app, dir);
    await app.ready();

    const index = await app.inject({ method: "GET", url: "/" });
    expect(index.statusCode).toBe(200);
    expect(index.body).toContain("ok");

    const asset = await app.inject({ method: "GET", url: "/assets/app.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain("console.log");

    const apiMiss = await app.inject({ method: "GET", url: "/api/v1/missing" });
    expect(apiMiss.statusCode).toBe(404);
    expect(JSON.parse(apiMiss.body).success).toBe(false);

    await app.close();
  });
});

describe("CORS for file:// Origin", () => {
  it("allows Origin null with wildcard", async () => {
    const app = Fastify({ logger: false });
    await app.register(cors, {
      origin: (origin, cb) => {
        if (!origin || origin === "null") {
          cb(null, "*");
          return;
        }
        cb(null, origin);
      },
    });
    app.get("/api/v1/health", async () => ({ success: true }));
    await app.ready();

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/health",
      headers: { origin: "null" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    await app.close();
  });
});
