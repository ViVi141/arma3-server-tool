import { test, expect } from "@playwright/test";
import {
  attachErrorGuards,
  connectConsole,
  connectMockedConsole,
  ensureTestServer,
  installMockApi,
  navigateConsoleTab,
  openFirstServerWizard,
  openInstanceMenu,
  setThemeMode,
} from "./helpers";

test.describe("Arma3 Server Tools Web UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("loads connections page", async ({ page }) => {
    await expect(page.getByTestId("connections-page")).toBeVisible();
    await expect(
      page.getByTestId("connections-page").getByRole("heading", { name: "主机连接", exact: true })
    ).toBeVisible();
  });

  test("shows default local connection", async ({ page }) => {
    const localRow = page.getByTestId("connection-row-local");
    await expect(localRow).toBeVisible();
    await expect(localRow.getByText("本机", { exact: true })).toBeVisible();
    await expect(localRow.getByText("127.0.0.1:19580")).toBeVisible();
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
    // 概览页没有可保存的编辑器，保存只能在设置页出现；配置动作收敛为「应用更改」。
    await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("btn-apply")).toBeVisible();
    await expect(page.getByTestId("btn-apply")).toHaveText("应用更改");
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
    const toggle = page.getByTestId("theme-mode-select");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveJSProperty("tagName", "BUTTON");
    await expect(toggle).toHaveAttribute("data-theme-mode", "system");

    await setThemeMode(page, "light");
    await expect(toggle).toHaveAttribute("data-theme-mode", "light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("a3st-theme-mode")))
      .toBe("light");

    await setThemeMode(page, "dark");
    await expect(toggle).toHaveAttribute("data-theme-mode", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("a3st-theme-mode")))
      .toBe("dark");

    await setThemeMode(page, "system");
    await expect(toggle).toHaveAttribute("data-theme-mode", "system");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("a3st-theme-mode")))
      .toBe("system");
    const prefersDark = await page.evaluate(
      () => window.matchMedia("(prefers-color-scheme: dark)").matches
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", prefersDark ? "dark" : "light");
  });

  test("add connection dialog", async ({ page }) => {
    await page.getByTestId("btn-add-host").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByTestId("input-host-name").fill("E2E Test");
    await page.getByTestId("input-host-url").fill("http://127.0.0.1:19580");
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

test.describe("F16 Legacy Regression Boundaries (Tier 2)", () => {
  test("F16-T2-01 zero console.error and pageerror across baseline console flows", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("connections-page")).toBeVisible();
    await ensureTestServer(page);
    for (const tab of ["basic", "mods", "logs", "preflight", "dashboard"]) {
      await navigateConsoleTab(page, tab);
    }
    guards.assertClean();
  });

  test("F16-T2-02 empty server list transitions cleanly to populated dashboard", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await installMockApi(page, { servers: [] });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await connectConsole(page);

    await expect(page.getByTestId("content-empty-state")).toBeVisible();
    await expect(page.getByTestId("btn-first-server-wizard-main")).toBeVisible();
    await expect(page.getByTestId("btn-new-server-empty")).toBeVisible();
    await expect(page.getByTestId("mode-config")).toBeDisabled();

    await page.getByTestId("btn-first-server-wizard-main").click();
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-config-name").fill("Bootstrapped Server");
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-opt-install-dedicated").uncheck();
    await page.getByTestId("wizard-opt-ensure-steamcmd").uncheck();
    await page.getByTestId("wizard-opt-write-cfg").uncheck();
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-finish").click();

    await expect(page.getByTestId("first-server-wizard")).not.toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("dashboard-page")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("mode-config")).toBeEnabled();
    guards.assertClean();
  });

  test("F16-T2-03 repeated FirstServerWizard open, advance, cancel, and reopen stays clean", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);

    await openFirstServerWizard(page);
    const wizard = page.getByTestId("first-server-wizard");
    await expect(wizard).toBeVisible();
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-config-name").fill("Temp Abort");
    await page.getByTestId("wizard-next").click();
    await wizard.getByRole("button", { name: "取消" }).click();
    await expect(wizard).not.toBeVisible();

    await openFirstServerWizard(page);
    await expect(wizard).toBeVisible();
    await expect(wizard.getByRole("heading", { name: "首服向导" })).toBeVisible();
    await wizard.getByRole("button", { name: "取消" }).click();
    await expect(wizard).not.toBeVisible();
    guards.assertClean();
  });

  test("F16-T2-04 NewServerDialog cancel leaves list unchanged and confirm creates server", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);

    await openInstanceMenu(page);
    // 下拉菜单内容会随状态刷新重建，用原生 click 规避 detach 重试
    await page.getByTestId("btn-new-server").evaluate((el) => (el as HTMLElement).click());
    const dialog = page.getByTestId("new-server-dialog");
    await expect(dialog).toBeVisible();
    await page.getByTestId("new-server-name").fill("Should Not Create");
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(dialog).not.toBeVisible();

    await openInstanceMenu(page);
    await expect(page.getByTestId("server-list")).not.toContainText("Should Not Create");

    await page.getByTestId("btn-new-server").evaluate((el) => (el as HTMLElement).click());
    await expect(dialog).toBeVisible();
    await page.getByTestId("new-server-name").fill("Created-Alpha");
    await page.getByTestId("new-server-confirm").click();
    await expect(dialog).not.toBeVisible();

    await expect(page.getByTestId("server-panel")).toContainText("Created-Alpha");
    guards.assertClean();
  });

  test("F16-T2-05 special characters in server creation render safely in UI and hash route", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);

    const specialName = "[CN] Op #1 (Altis) & <Team>";
    await openInstanceMenu(page);
    await page.getByTestId("btn-new-server").click();
    await page.getByTestId("new-server-name").fill(specialName);
    await page.getByTestId("new-server-confirm").click();

    await expect(page.getByTestId("new-server-dialog")).not.toBeVisible();
    await expect(page.getByTestId("server-panel")).toContainText(specialName);
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    guards.assertClean();
  });
});
