import { test, expect } from "@playwright/test";
import {
  connectConsole,
  ensureTestServer,
  navigateConsoleTab,
  openFirstServerWizard,
} from "./helpers";

test.describe("Arma3 Server Tools Web UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("loads connections page", async ({ page }) => {
    await expect(page.getByTestId("connections-page")).toBeVisible();
    await expect(
      page.getByTestId("connections-page").getByText("主机连接", { exact: true })
    ).toBeVisible();
  });

  test("shows default local connection", async ({ page }) => {
    await expect(page.getByTestId("connection-row-local")).toBeVisible();
    await expect(page.getByText("本机")).toBeVisible();
    await expect(page.getByText("127.0.0.1:19580")).toBeVisible();
  });

  test("connect navigates to console", async ({ page }) => {
    await connectConsole(page);
    await expect(page.getByTestId("console-shell")).toBeVisible();
    await expect(page.getByTestId("server-panel")).toBeVisible();
    await expect(page.getByTestId("nav-panel")).toBeVisible();
  });

  test("console toolbar has core actions", async ({ page }) => {
    await ensureTestServer(page);
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await expect(page.getByRole("button", { name: "启动" })).toBeVisible();
    await expect(page.getByRole("button", { name: "保存" })).toBeVisible();
    await expect(page.getByRole("button", { name: "写入游戏配置" })).toBeVisible();
    await navigateConsoleTab(page, "preflight");
    await expect(page.getByTestId("preflight-page")).toBeVisible();
    await expect(page.locator(".shell-v2__actions [data-testid='btn-preflight']")).toBeVisible();
    await expect(page.locator(".shell-v2__actions [data-testid='btn-preflight']")).toHaveText("开服检查");
    await expect(page.getByTestId("status-bar")).toBeVisible();
  });

  test("sidebar navigation switches tabs", async ({ page }) => {
    await ensureTestServer(page);

    const tabs = ["basic", "mods", "rcon", "logs", "preflight"];
    for (const tab of tabs) {
      await navigateConsoleTab(page, tab);
      await expect(page.getByTestId(`nav-${tab}`)).toHaveClass(/is-active/);
    }
  });

  test("theme mode select is available", async ({ page }) => {
    const select = page.getByTestId("theme-mode-select");
    await expect(select).toBeVisible();
    await select.selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await select.selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await select.selectOption("system");
  });

  test("add connection dialog", async ({ page }) => {
    await page.getByTestId("btn-add-host").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByPlaceholder("我的服务器").fill("E2E Test");
    await page.getByPlaceholder("http://127.0.0.1:19580").fill("http://127.0.0.1:19580");
    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("mods page loads from navigation", async ({ page }) => {
    await ensureTestServer(page);
    await navigateConsoleTab(page, "mods");
    await expect(page.getByText("扫描刷新")).toBeVisible();
    await expect(page.getByText("获取模组")).toBeVisible();
  });

  test("first server wizard opens from toolbar", async ({ page }) => {
    await connectConsole(page);
    await openFirstServerWizard(page);
    const dialog = page.getByTestId("first-server-wizard");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "首服向导" })).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    await expect(dialog).not.toBeVisible();
  });

  test("first server wizard has steamcmd step", async ({ page }) => {
    await connectConsole(page);
    await openFirstServerWizard(page);
    for (let i = 0; i < 4; i++) {
      await page.getByTestId("wizard-next").click();
    }
    await expect(page.getByTestId("wizard-steamcmd-step")).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
  });

  test("connections page shows remote hint", async ({ page }) => {
    await expect(page.getByTestId("remote-connection-hint")).toBeVisible();
  });
});
