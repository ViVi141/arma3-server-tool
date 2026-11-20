import { expect, test, type Page } from "@playwright/test";
import type { MaintenanceDiscovery, MaintenancePreview, MaintenanceResult } from "@a3st/api-client";
import { attachErrorGuards, connectMockedConsole, navigateConsoleTab } from "./helpers";

const NOW = new Date("2026-11-20T10:00:00Z").toISOString();

function discovery(patch: Partial<MaintenanceDiscovery> & Pick<MaintenanceDiscovery, "key" | "modId" | "title" | "physicalPath">): MaintenanceDiscovery {
  return {
    configuredUuids: ["srv-e2e-1"],
    localVersion: { timeUpdated: 1760000000, sizeBytes: 1024, manifest: "111111", acfPath: "C:\\steamcmd\\steamapps\\workshop\\content\\107410\\0\\appworkshop.acf" },
    remoteVersion: { timeUpdated: 1765000000, sizeBytes: 2048 },
    status: "outdated", checkedAt: NOW, pendingSince: NOW, ...patch,
  };
}

const ACE = discovery({ key: "key-ace", modId: 463939057, title: "ACE3", physicalPath: "C:\\arma3\\mods\\@ace" });
const CBA = discovery({ key: "key-cba", modId: 450814997, title: "CBA_A3", physicalPath: "C:\\arma3\\mods\\@cba" });

function preview(entries: MaintenanceDiscovery[]): MaintenancePreview {
  return {
    createdAt: NOW, selectedKeys: entries.map((item) => item.key), mods: entries,
    impact: { resources: [], serverUuids: ["srv-e2e-1"], headlessUuids: [], issues: [], complete: true },
    instances: [{
      serverUuid: "srv-e2e-1", headlessRunning: false,
      presence: { running: true, onlineCount: 0, observedAt: 1765000000, idleSince: 1764990000 },
      eligibility: { allowed: true, reasonCode: null, reason: "连续无人且处于维护窗口", inWindow: true, overdue: false, requiresCountdown: true },
    }],
    canExecute: true, reasons: [], commonTime: null,
    thresholds: { checkSeconds: 600, sampleSeconds: 15, idleSeconds: 900, onlineFreshSeconds: 60, maxWaitHours: 48, countdownSeconds: [30, 15, 5] },
    warning: "执行前会重新校验在线状态、会话与运行范围。",
  };
}

function batch(id: string, state: string, result: string | null = null): MaintenanceResult {
  return { id, state, createdAt: NOW, updatedAt: NOW, serverUuids: ["srv-e2e-1"], modIds: [463939057], requiresAttention: state === "manual_intervention", result };
}

interface MaintenanceMockHandle {
  writes: { method: string; path: string; body: unknown }[];
}

/**
 * 维护端点必须在 installMockApi 的 catch-all 之后注册（后注册优先）；
 * 未覆盖的请求 fallback 给通用 mock，避免污染其他页面。
 */
async function maintenanceMock(page: Page, initial: { state: string; result?: string | null }): Promise<MaintenanceMockHandle> {
  const writes: { method: string; path: string; body: unknown }[] = [];
  let state = initial.state;
  let result = initial.result ?? null;
  let currentId = "batch-1";
  let retryId: string | null = null;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    const reply = (data: unknown) => route.fulfill({ json: { success: true, data, error: null, requestId: "maintenance-test" } });
    if (method === "GET" && /\/maintenance\/updates$/.test(path)) return reply([ACE, CBA]);
    if (method === "POST" && /\/maintenance\/check$/.test(path)) {
      writes.push({ method, path, body });
      return reply([ACE, CBA]);
    }
    if (method === "POST" && /\/maintenance\/preview$/.test(path)) return reply(preview((body as { keys: string[] }).keys.map((key) => key === ACE.key ? ACE : CBA)));
    if (method === "POST" && /\/maintenance\/execute$/.test(path)) {
      writes.push({ method, path, body });
      currentId = "batch-1";
      return reply({ id: currentId, state: "queued" });
    }
    if (method === "GET" && /\/ops\/maintenance\/[^/]+$/.test(path)) {
      const id = path.split("/").pop()!;
      if (retryId && id === retryId) return reply(batch(id, "succeeded"));
      return reply({ ...batch(currentId, state, result), id });
    }
    if (method === "POST" && /\/ops\/maintenance\/[^/]+\/cancel$/.test(path)) {
      writes.push({ method, path, body });
      state = "cancelled";
      return reply({ cancelled: true });
    }
    if (method === "POST" && /\/ops\/maintenance\/[^/]+\/resolve$/.test(path)) {
      writes.push({ method, path, body });
      state = "failed";
      result = "MANUAL_RELEASED";
      return reply({ id: currentId, state, result });
    }
    if (method === "POST" && /\/ops\/maintenance\/[^/]+\/retry$/.test(path)) {
      writes.push({ method, path, body });
      retryId = "batch-2";
      return reply({ id: retryId, state: "queued" });
    }
    return route.fallback();
  });
  return { writes };
}

async function selectAceAndPreview(page: Page) {
  const panel = page.locator(".ark-tech-panel").filter({ hasText: "共享模组维护预览" }).first();
  const row = page.locator(".el-table__row").filter({ hasText: "@ace" }).first();
  await expect(row).toBeVisible();
  await row.locator(".el-checkbox").first().click();
  await page.getByRole("button", { name: "预览选中 1 个物理目录", exact: true }).click();
  await expect(panel.locator(".el-alert__title").filter({ hasText: "当前门禁通过，执行前仍须复核" })).toBeVisible();
}

function alertTitle(page: Page, text: string) {
  return page.locator(".el-alert__title").filter({ hasText: text });
}

test("维护预览、执行需确认且带幂等请求 ID；人工介入批次必须显式确认释放", async ({ page }, testInfo) => {
  const guards = attachErrorGuards(page);
  await connectMockedConsole(page);
  const mock = await maintenanceMock(page, { state: "manual_intervention" });
  await navigateConsoleTab(page, "scheduler");
  await expect(page.getByText("共享模组维护预览", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "检查维护更新", exact: true }).click();
  await expect(page.locator(".el-table__row").filter({ hasText: "@ace" }).first()).toBeVisible();
  expect(mock.writes.filter((item) => item.path.endsWith("/maintenance/check"))).toHaveLength(1);

  await selectAceAndPreview(page);
  await page.getByRole("button", { name: "执行维护（停止受影响实例）", exact: true }).click();
  const confirm = page.locator(".el-message-box").filter({ hasText: "确认执行维护" });
  await expect(confirm).toContainText("将停止 1 个受影响实例");
  await confirm.getByRole("button", { name: "执行", exact: true }).click();

  await expect(alertTitle(page, "需人工介入（保留备份与锁）")).toBeVisible();
  const execute = mock.writes.find((item) => item.path.endsWith("/maintenance/execute"))!;
  expect(execute.body).toMatchObject({ keys: [ACE.key] });
  expect((execute.body as { requestId: string }).requestId).toMatch(/^[0-9a-f]{32}$/);
  expect(execute.body).not.toHaveProperty("writeCfgAfter");
  expect(execute.body).not.toHaveProperty("restartAfter");

  const release = page.getByRole("button", { name: "人工处理完成并释放锁", exact: true });
  await expect(release).toBeEnabled();
  await release.click();
  const releaseDialog = page.locator(".el-message-box").filter({ hasText: "确认现场已处理" });
  await expect(releaseDialog).toContainText("备份与事件证据保留");
  await releaseDialog.getByRole("button", { name: "确认已处理并释放锁", exact: true }).click();

  await expect(alertTitle(page, "批次 batch-1：失败；原因 MANUAL_RELEASED")).toBeVisible();
  const resolved = mock.writes.find((item) => item.path.endsWith("/resolve"))!;
  expect(resolved.body).toEqual({ confirm: "manual_handled" });
  await expect(page.getByRole("button", { name: "按原目标重试", exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("ops-maintenance-manual-release.png"), fullPage: true });
  guards.assertClean();
});

test("旧更新 Cron 不会被静默改写；显式迁移后只停用更新任务并同步调度器", async ({ page }, testInfo) => {
  const guards = attachErrorGuards(page);
  const mock = await connectMockedConsole(page);
  await navigateConsoleTab(page, "scheduler");
  const policy = page.locator(".ark-tech-panel").filter({ hasText: "逐服维护策略" }).first();
  await expect(policy).toBeVisible();

  // 两行自定义任务：第一行是待迁移的旧更新 Cron，第二行必须保持不变。
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  const rows = page.locator(".el-table__row").filter({ has: page.locator(".el-select") });
  await expect(rows).toHaveCount(2);
  await rows.nth(0).locator(".el-select").click();
  await page.getByRole("option", { name: "检查/更新模组", exact: true }).click();
  await policy.locator(".el-checkbox").filter({ hasText: "启用本服维护策略（默认关闭）" }).click();

  // 迁移前保存必须被拒绝，配置不落库，避免双重调度。
  await page.getByRole("button", { name: "保存并同步到调度器", exact: true }).click();
  await expect(page.getByText("仍有启用的旧更新 Cron，请先预览迁移或显式停用，避免双重调度", { exact: true })).toBeVisible();
  expect(mock.getRequests("PATCH", "/config")).toHaveLength(0);

  await page.getByRole("button", { name: "预览旧更新 Cron 迁移", exact: true }).click();
  const dialog = page.locator(".el-message-box").filter({ hasText: "旧更新 Cron 迁移预览" });
  await expect(dialog).toContainText("将停用以下旧更新任务（非更新任务不变）");
  await expect(dialog).toContainText("task_1");
  await dialog.getByRole("button", { name: "确认迁移并待保存", exact: true }).click();

  await page.getByRole("button", { name: "保存并同步到调度器", exact: true }).click();
  await expect.poll(() => mock.getRequests("PATCH", "/config").length).toBe(1);
  const patch = mock.getRequests("PATCH", "/config")[0].body as {
    scheduler: { cronJobs: Record<string, { actionText: string; enabled: boolean; taskId: string }> };
    maintenance: { enabled: boolean };
  };
  expect(patch.scheduler.cronJobs.task_1).toMatchObject({ actionText: "update_mods", enabled: false });
  expect(patch.scheduler.cronJobs.task_2).toMatchObject({ actionText: "restart", enabled: true });
  expect(patch.maintenance.enabled).toBe(true);
  await expect.poll(() => mock.getRequests("POST", "/api/v1/task").length).toBeGreaterThan(0);
  const actions = mock.getRequests("POST", "/api/v1/task").flatMap((item) =>
    (item.body as { commands: { action: string }[] }).commands.map((cmd) => cmd.action));
  expect(actions).toContain("sync_cron_jobs");
  await page.screenshot({ path: testInfo.outputPath("ops-maintenance-cron-migration.png"), fullPage: true });
  guards.assertClean();
});

test("取消只停止后续步骤并保留有限恢复；重试沿用原目标并显示健康确认结果", async ({ page }, testInfo) => {
  const guards = attachErrorGuards(page);
  await connectMockedConsole(page);
  const recorded = await maintenanceMock(page, { state: "countdown" });
  await navigateConsoleTab(page, "scheduler");
  await expect(page.getByText("共享模组维护预览", { exact: true })).toBeVisible();
  await selectAceAndPreview(page);
  await page.getByRole("button", { name: "执行维护（停止受影响实例）", exact: true }).click();
  await page.locator(".el-message-box").filter({ hasText: "确认执行维护" }).getByRole("button", { name: "执行", exact: true }).click();
  await expect(alertTitle(page, "批次 batch-1：游戏内预告倒计时")).toBeVisible();

  await page.getByRole("button", { name: "取消后续步骤", exact: true }).click();
  const cancelDialog = page.locator(".el-message-box").filter({ hasText: "取消维护" });
  await expect(cancelDialog).toContainText("不会强停进程");
  await cancelDialog.getByRole("button", { name: "取消维护", exact: true }).click();
  await expect(alertTitle(page, "批次 batch-1：已取消")).toBeVisible();

  const retry = page.getByRole("button", { name: "按原目标重试", exact: true });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(alertTitle(page, "批次 batch-2：更新完成")).toBeVisible();

  const execute = recorded.writes.find((item) => item.path.endsWith("/maintenance/execute"))!;
  const retried = recorded.writes.find((item) => item.path.endsWith("/retry"))!;
  const retriedBody = retried.body as { requestId: string };
  expect(retriedBody.requestId).toMatch(/^[0-9a-f]{32}$/);
  expect(retriedBody.requestId).not.toBe((execute.body as { requestId: string }).requestId);
  await expect(page.getByText("健康确认来自独立 RPT 心跳；完成不代表公网可达性或真实玩家加入已验证。", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ops-maintenance-cancel-retry.png"), fullPage: true });
  guards.assertClean();
});
