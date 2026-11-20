import { expect, test, type Page } from "@playwright/test";
import type { NotificationSettingsData, OperationEvent, EmailDelivery } from "@a3st/api-client";
import { attachErrorGuards, connectMockedConsole, navigateConsoleTab, openInstanceMenu } from "./helpers";

function event(id: string, sequence: number, serverUuid = "srv-e2e-1"): OperationEvent {
  const at = new Date().toISOString();
  return { eventId: id, sequence, type: "health_unhealthy", severity: "critical", serverUuids: [serverUuid], modIds: [123], batchId: null,
    reasonCode: `HEALTH_${id}`, message: "90 秒没有任务心跳", suggestedAction: "检查独立 RPT 和 RCon", requiresAttention: true,
    occurredAt: at, updatedAt: at, recoveredAt: null, acknowledgedAt: null, change: "occurred" };
}
async function opsMock(page: Page) {
  let settings: NotificationSettingsData = { enabled: false, host: "127.0.0.1", port: 2525, tls: "starttls", username: "unit-user", from: "ops@example.test", recipients: ["admin@example.test"], passwordConfigured: true, readTokenConfigured: true };
  let items = [event("first", 1), event("second", 2, "srv-e2e-2")];
  const deliveries: EmailDelivery[] = [];
  const writes: { method: string; path: string; body: unknown }[] = [];
  const cursors: string[] = [];
  let expiredOnce = false;
  await page.route("**/api/v1/ops/**", async (route) => {
    const request = route.request(); const url = new URL(request.url()); const method = request.method();
    const body = request.postData() ? request.postDataJSON() : undefined;
    if (method !== "GET") writes.push({ method, path: url.pathname, body });
    let data: unknown = null;
    if (url.pathname.endsWith("/events")) {
      cursors.push(url.searchParams.get("after") ?? "initial");
      if (expiredOnce) { expiredOnce = false; return route.fulfill({ status: 410, json: { success: false, error: "CURSOR_EXPIRED", data: { earliestCursor: 2, message: "事件游标已过期" } } }); }
      const after = Number(url.searchParams.get("after") ?? 0);
      const remaining = items.filter((item) => item.sequence > after);
      data = { items: remaining.slice(0, 1), nextCursor: remaining[0]?.sequence ?? after, earliestCursor: 0, hasMore: remaining.length > 1 };
    } else if (url.pathname.endsWith("/acknowledge")) {
      const id = url.pathname.split("/").at(-2);
      const old = items.find((item) => item.eventId === id)!;
      const next = { ...old, sequence: Math.max(...items.map((item) => item.sequence)) + 1, acknowledgedAt: new Date().toISOString(), change: "acknowledged" as const };
      items = [...items.filter((item) => item.eventId !== id), next]; data = next;
    } else if (url.pathname.endsWith("/settings")) {
      if (method === "PUT") settings = { ...body, passwordConfigured: true, readTokenConfigured: true };
      data = settings;
    } else if (url.pathname.endsWith("/test")) {
      const delivery: EmailDelivery = { id: "mail-test", eventId: null, sequence: null, kind: "test", state: "failed", attempts: 5,
        createdAt: new Date().toISOString(), nextAttemptAt: null, sentAt: null, lastError: "SMTP_AUTH", from: settings.from, recipients: settings.recipients, subject: "[A3ST] 测试邮件", text: "测试" };
      deliveries.push(delivery); data = delivery;
    } else if (url.pathname.endsWith("/deliveries")) data = deliveries;
    return route.fulfill({ json: { success: true, data, error: null, requestId: "ops-test" } });
  });
  return { writes, cursors, expire: () => { expiredOnce = true; }, recover: () => { items = items.map((item) => item.eventId === "first" ? { ...item, sequence: 10, recoveredAt: new Date().toISOString(), change: "recovered" } : item); } };
}

test("事件补拉、已读与恢复分离、游标过期显式重新同步", async ({ page }) => {
  await connectMockedConsole(page); const ops = await opsMock(page); await navigateConsoleTab(page, "operations");
  const view = page.getByTestId("operations-page");
  await expect(view.getByText("HEALTH_first", { exact: true })).toBeVisible();
  await view.getByRole("button", { name: "还有事件未加载，加载下一页" }).click();
  await expect(view.getByText("HEALTH_second", { exact: true })).toBeVisible();
  const firstRow = view.locator(".el-table__row").filter({ hasText: "HEALTH_first" });
  await firstRow.getByRole("button", { name: "确认已读" }).click();
  await expect(firstRow).toContainText("已读"); await expect(firstRow).toContainText("需人工介入");
  await expect(firstRow).not.toContainText("已恢复 / 已完成");
  ops.recover(); await view.getByRole("button", { name: "刷新事件", exact: true }).click();
  await expect(firstRow).toContainText("已恢复 / 已完成");
  ops.expire(); await view.getByRole("button", { name: "刷新事件", exact: true }).click();
  await expect(view.getByText("事件游标已过期", { exact: true })).toBeVisible();
  await view.getByRole("button", { name: "游标失效，重新同步" }).click();
  expect(ops.cursors.at(-1)).toBe("initial");
  expect(ops.writes.filter((item) => item.path.endsWith("/acknowledge"))).toHaveLength(1);
});

test("通知设置即时保存不改实例；测试邮件显式确认且失败状态可见，不显示密码输入", async ({ page }, testInfo) => {
  const guards = attachErrorGuards(page);
  const mock = await connectMockedConsole(page); const ops = await opsMock(page); await navigateConsoleTab(page, "operations");
  const view = page.getByTestId("operations-page");
  await expect(view.locator('input[type="password"]')).toHaveCount(0);
  await expect(view).toContainText("SMTP 密码：服务端已配置");
  await view.getByRole("textbox", { name: "收件人", exact: true }).fill("one@example.test\ntwo@example.test");
  await expect(view.getByRole("button", { name: "发送测试邮件", exact: true })).toBeDisabled();
  await view.getByRole("button", { name: "保存通知设置" }).click();
  await expect(view.getByRole("button", { name: "发送测试邮件", exact: true })).toBeEnabled();
  const save = ops.writes.find((item) => item.method === "PUT")!;
  expect(save.body).toMatchObject({ recipients: ["one@example.test", "two@example.test"], tls: "starttls" });
  expect(save.body).not.toHaveProperty("password"); expect(save.body).not.toHaveProperty("passwordConfigured");
  await view.getByRole("button", { name: "发送测试邮件", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "发送测试邮件", exact: true });
  await expect(dialog).toContainText("one@example.test、two@example.test");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  expect(ops.writes.filter((item) => item.path.endsWith("/test"))).toHaveLength(0);
  await view.getByRole("button", { name: "发送测试邮件", exact: true }).click();
  await dialog.getByRole("button", { name: "发送", exact: true }).click();
  await expect(view).toContainText("重试耗尽"); await expect(view).toContainText("SMTP_AUTH");
  expect(mock.getRequests("PATCH", "/config")).toHaveLength(0); expect(mock.getRequests("POST", "/api/v1/task")).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath("ops-notifications.png"), fullPage: true }); guards.assertClean();
});

test("未保存设置离开有提示；切实例保留主机设置，不把事件误当本服", async ({ page }) => {
  await connectMockedConsole(page, { servers: [{ uuid: "srv-e2e-1", configName: "一服" }, { uuid: "srv-e2e-2", configName: "二服" }] });
  await opsMock(page); await navigateConsoleTab(page, "operations");
  const view = page.getByTestId("operations-page");
  await view.getByRole("textbox", { name: "SMTP 主机", exact: true }).fill("changed.example.test");
  await openInstanceMenu(page); await page.getByTestId("server-item-srv-e2e-2").click();
  await expect(view.getByRole("textbox", { name: "SMTP 主机", exact: true })).toHaveValue("changed.example.test");
  await view.getByText("仅当前实例", { exact: true }).click();
  await expect(view.getByRole("checkbox", { name: "仅当前实例" })).toBeChecked();
  await expect(view.getByText("HEALTH_first", { exact: true })).toHaveCount(0);
  await page.getByTestId("nav-rcon").click();
  const dialog = page.getByRole("dialog", { name: "未保存的通知设置" });
  await expect(dialog).toBeVisible(); await dialog.getByRole("button", { name: "继续编辑" }).click();
  await expect(view).toBeVisible();
  await page.getByTestId("nav-rcon").click(); await dialog.getByRole("button", { name: "丢弃并离开" }).click();
  await expect(view).not.toBeVisible();
});

test("窄屏事件和通知不使整页横向溢出；明确离线监测边界", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connectMockedConsole(page); await opsMock(page); await navigateConsoleTab(page, "operations");
  const view = page.getByTestId("operations-page");
  await expect(view).toContainText("Service / 主机整体离线时无法自行发邮件");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("ops-mobile.png"), fullPage: true });
});
