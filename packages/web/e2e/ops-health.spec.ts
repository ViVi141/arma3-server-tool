import { expect, test, type Page } from "@playwright/test";
import type { ServerHealthData } from "@a3st/api-client";
import { attachErrorGuards, connectMockedConsole, navigateConsoleTab, openInstanceMenu } from "./helpers";

function health(overrides: Partial<ServerHealthData> = {}): ServerHealthData {
  const now = new Date().toISOString();
  return {
    serverUuid: "srv-e2e-1", state: "healthy", checkedAt: now, sessionStartedAt: now,
    pid: 4242, processAlive: true, rconResponsive: true, onlineCount: 0, fps: 48,
    heartbeat: { epoch: 1, sequence: 4, mission: "无人测试", world: "Altis", uptimeSeconds: 100, missionSeconds: 60, fps: 48, emittedAt: now, receivedAt: now },
    consecutiveHeartbeats: 4, rptPath: "C:\\arma3\\a3st_serverconfig\\srv-e2e-1\\server.rpt",
    reasons: [], configurationIssues: [], thresholds: { heartbeatSeconds: 15, sampleSeconds: 10, staleSeconds: 90, startupTimeoutSeconds: 600 },
    publicReachability: "unverified", playerJoin: "unverified", ...overrides,
  };
}
async function setHealth(page: Page, data: ServerHealthData) {
  await page.route("**/api/v1/servers/*/health", (route) => route.fulfill({ json: { success: true, data, error: null, requestId: "health-test" } }));
  await page.getByRole("button", { name: "刷新健康" }).click();
}
async function prepare(page: Page) {
  await page.getByTestId("prepare-unattended").click();
  await page.getByRole("dialog", { name: "确认无人自动运行配置" }).getByRole("button", { name: "加入待应用更改" }).click();
}

test("无人组合预览和取消无写入；确认仅标待保存，应用后可选择不重启", async ({ page }, testInfo) => {
  const guards = attachErrorGuards(page);
  const mock = await connectMockedConsole(page, { isRunning: true, missions: [{ template: "First.Altis" }, { template: "Second.Tanoa" }] });
  await navigateConsoleTab(page, "missions");
  await page.locator(".el-select").filter({ has: page.getByRole("combobox", { name: "无人运行启动任务" }) }).click();
  await page.getByRole("option", { name: "Second.Tanoa" }).click();
  await page.getByTestId("prepare-unattended").click();
  const preview = page.getByRole("dialog", { name: "确认无人自动运行配置" });
  await expect(preview).toContainText("Second.Tanoa");
  for (const text of ["autoInit", "persistent", "noLogs", "RPT"]) await expect(preview).toContainText(text);
  await preview.getByRole("button", { name: "取消", exact: true }).click();
  expect(mock.getRequests("PATCH", "/config")).toHaveLength(0);
  expect(mock.getRequests("POST", "/api/v1/task")).toHaveLength(0);
  await prepare(page);
  expect(mock.getRequests("PATCH", "/config")).toHaveLength(0);
  expect(mock.getRequests("POST", "/api/v1/task")).toHaveLength(0);
  await page.getByTestId("btn-apply").click();
  const restart = page.getByRole("dialog", { name: "应用更改", exact: true });
  await expect(restart).toBeVisible();
  await restart.getByRole("button", { name: "稍后" }).click();
  const patches = mock.getRequests("PATCH", "/config");
  expect(patches).toHaveLength(1);
  expect(patches[0].body).toMatchObject({ health: { enabled: true, unattended: true, startupTimeoutSeconds: 600 }, startup: { autoInit: true }, basic: { persistent: true, noLogs: false } });
  expect((patches[0].body as { tasks: { missions: { template: string }[] } }).tasks.missions.map((m) => m.template)).toEqual(["Second.Tanoa", "First.Altis"]);
  const actions = mock.getRequests("POST", "/api/v1/task").flatMap((r) => (r.body as { commands: { action: string }[] }).commands.map((c) => c.action));
  expect(actions).toContain("write_cfg");
  expect(actions).not.toContain("restart");
  expect(actions).not.toContain("start");
  await page.screenshot({ path: testInfo.outputPath("unattended-config.png"), fullPage: true });
  guards.assertClean();
});

test("缺少任务禁止组合；关闭目标不自动撤销已应用启动配置", async ({ page }) => {
  const mock = await connectMockedConsole(page, { missions: [] });
  await navigateConsoleTab(page, "missions");
  await page.getByTestId("prepare-unattended").click();
  await expect(page.getByText("请先上传或扫描任务并指定启动模板", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "确认无人自动运行配置" })).toHaveCount(0);
  expect(mock.getRequests("PATCH", "/config")).toHaveLength(0);
});

test("保存服务端模板错误给出原因且不继续写配置", async ({ page }) => {
  const guards = attachErrorGuards(page);
  await connectMockedConsole(page);
  await navigateConsoleTab(page, "missions");
  await prepare(page);
  await page.route("**/api/v1/servers/*/config", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await route.fulfill({ json: { success: false, error: "INVALID_HEALTH_CONFIG", data: { message: "启动任务模板在磁盘上不存在" } } });
  });
  await page.getByTestId("btn-page-save").click();
  await expect(page.getByText("启动任务模板在磁盘上不存在", { exact: true })).toBeVisible();
  guards.assertClean();
});

test("关闭无人目标保留独立心跳，不隐式修改 autoInit 和 persistent", async ({ page }) => {
  const mock = await connectMockedConsole(page);
  await navigateConsoleTab(page, "missions");
  await prepare(page);
  await page.getByTestId("btn-page-save").click();
  await expect.poll(() => mock.getRequests("PATCH", "/config").length).toBe(1);
  await page.getByRole("button", { name: "关闭无人运行目标" }).click();
  await page.getByTestId("btn-page-save").click();
  await expect.poll(() => mock.getRequests("PATCH", "/config").length).toBe(2);
  const patch = mock.getRequests("PATCH", "/config")[1].body;
  expect(patch).toMatchObject({ health: { enabled: true, unattended: false } });
  expect(patch).not.toHaveProperty("startup");
  expect(patch).not.toHaveProperty("basic.persistent");
});

test("独立健康显示实际任务与证据；RCon 和 FPS 未知不当作零", async ({ page }, testInfo) => {
  const guards = attachErrorGuards(page);
  await connectMockedConsole(page, { isRunning: true });
  await setHealth(page, health());
  const panel = page.getByTestId("server-health-panel");
  await expect(page.getByTestId("server-health-state")).toHaveText("健康");
  await expect(panel).toContainText("无人测试 / Altis");
  await expect(panel).toContainText("公网可达性、真实玩家加入尚未验证");
  await setHealth(page, health({ state: "unhealthy", onlineCount: null, rconResponsive: false, fps: null, reasons: ["RCon 超时，在线人数未知"] }));
  await expect(page.getByTestId("server-health-state")).toHaveText("异常");
  await expect(panel.locator(".health-evidence > div").filter({ hasText: "RCon 响应" })).toContainText("未通过 / 未知");
  await expect(panel.locator(".health-evidence > div").filter({ hasText: "运行时间 / FPS" })).toContainText("秒 / 未知");
  await page.screenshot({ path: testInfo.outputPath("health-evidence.png"), fullPage: true });
  guards.assertClean();
});

test("过期或非法检查时间不能沿用健康；维护和停止状态独立展示", async ({ page }) => {
  await connectMockedConsole(page);
  for (const checkedAt of [new Date(Date.now() - 60000).toISOString(), "invalid"]) {
    await setHealth(page, health({ checkedAt }));
    await expect(page.getByTestId("server-health-state")).toHaveText("未验证");
    await expect(page.getByTestId("server-health-panel").locator(".health-evidence")).toHaveCount(0);
  }
  for (const [state, label] of [["maintenance", "维护中"], ["stopped", "已停止"], ["starting", "启动中"]] as const) {
    await setHealth(page, health({ state }));
    await expect(page.getByTestId("server-health-state")).toHaveText(label);
  }
});

test("切换实例立即请求新健康，迟到的旧响应不覆盖新实例", async ({ page }) => {
  await connectMockedConsole(page, { servers: [{ uuid: "srv-e2e-1", configName: "一服", serverDir: "C:\\one" }, { uuid: "srv-e2e-2", configName: "二服", serverDir: "C:\\two" }] });
  let release!: () => void;
  let entered = false;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/servers/*/health", async (route) => {
    const first = route.request().url().includes("srv-e2e-1");
    if (first) { entered = true; await wait; }
    await route.fulfill({ json: { success: true, data: health(first ? {} : { serverUuid: "srv-e2e-2", state: "unverified", heartbeat: null, reasons: ["二服等待新心跳"] }) } });
  });
  await page.getByRole("button", { name: "刷新健康" }).click();
  await expect.poll(() => entered).toBe(true);
  await openInstanceMenu(page);
  await page.getByTestId("server-item-srv-e2e-2").click();
  await expect(page.getByTestId("server-health-panel")).toContainText("二服等待新心跳");
  release();
  await expect(page.getByTestId("server-health-state")).toHaveText("未验证");
});

test("窄屏无人配置和健康证据不超出视口", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connectMockedConsole(page);
  await setHealth(page, health());
  const panel = await page.getByTestId("server-health-panel").boundingBox();
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(391);
  await navigateConsoleTab(page, "missions");
  const card = page.getByTestId("unattended-config");
  await expect(card).toBeVisible();
  const box = await page.getByTestId("prepare-unattended").boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("unattended-mobile.png"), fullPage: true });
});
