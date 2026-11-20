import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createService } from "../app.js";

const dirs: string[] = [];
const apps: Array<Awaited<ReturnType<typeof createService>>> = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

async function service() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-maintenance-api-"));
  dirs.push(dataDir);
  const app = await createService({ port: 0, host: "127.0.0.1", dataDir });
  apps.push(app);
  return app;
}

describe("维护执行 HTTP 入口", () => {
  it("执行必须带幂等 requestId，不接受写配置/重启旁路参数", async () => {
    const app = await service();
    app.configStore.save("unit", { formatVersion: 2, server: { serverDir: path.join(app.dataDir, "server") } });
    const missing = await app.inject({ method: "POST", url: "/api/v1/servers/unit/maintenance/execute", payload: { keys: ["a".repeat(64)] } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error).toBe("INVALID_MAINTENANCE_REQUEST");
    const bypass = await app.inject({ method: "POST", url: "/api/v1/servers/unit/maintenance/execute",
      payload: { keys: ["a".repeat(64)], requestId: "request-0001", writeCfgAfter: true } });
    expect(bypass.statusCode).toBe(400);
    const unknown = await app.inject({ method: "POST", url: "/api/v1/servers/nope/maintenance/execute",
      payload: { keys: ["a".repeat(64)], requestId: "request-0001" } });
    expect(unknown.statusCode).toBe(404);
  });
  it("未知批次的查询、重试与取消返回 404，列表不泄露内部恢复步骤", async () => {
    const app = await service();
    expect((await app.inject({ method: "GET", url: "/api/v1/ops/maintenance/missing" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/v1/ops/maintenance/missing/retry", payload: { requestId: "request-0001" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/v1/ops/maintenance/missing/cancel" })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/v1/ops/maintenance/missing/resolve", payload: { confirm: "manual_handled" } })).statusCode).toBe(404);
    const list = await app.inject({ method: "GET", url: "/api/v1/ops/maintenance" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ success: true, data: [] });
  });
  it("人工释放必须显式确认现场已处理，不能当作普通取消", async () => {
    const app = await service();
    for (const payload of [{}, { confirm: true }, { confirm: "ok" }, { confirm: "manual_handled", force: true }]) {
      const response = await app.inject({ method: "POST", url: "/api/v1/ops/maintenance/missing/resolve", payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("INVALID_MAINTENANCE_REQUEST");
    }
  });
  it("只读运维 Token 不能执行、重试、取消或人工释放维护", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-maintenance-token-"));
    dirs.push(dataDir);
    const app = await createService({ port: 0, host: "127.0.0.1", dataDir, apiToken: "manage-token-value", opsReadToken: "read-token-value" });
    apps.push(app);
    for (const [method, url, payload] of [["POST", "/api/v1/servers/unit/maintenance/execute", { keys: ["a".repeat(64)], requestId: "request-0001" }],
      ["POST", "/api/v1/ops/maintenance/x/retry", { requestId: "request-0001" }], ["POST", "/api/v1/ops/maintenance/x/cancel", {}],
      ["POST", "/api/v1/ops/maintenance/x/resolve", { confirm: "manual_handled" }]] as const) {
      const response = await app.inject({ method, url, payload, headers: { authorization: "Bearer read-token-value" } });
      expect(response.statusCode).toBe(403);
    }
  });
});
