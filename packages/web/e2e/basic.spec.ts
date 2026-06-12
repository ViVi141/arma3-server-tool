import { test, expect } from "@playwright/test";

test.describe("Arma3 Server Tools Web UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("loads connections page", async ({ page }) => {
    await expect(page.getByTestId("connections-page")).toBeVisible();
    await expect(page.getByText("远程主机")).toBeVisible();
  });

  test("shows default local connection", async ({ page }) => {
    await expect(page.getByTestId("connection-row-local")).toBeVisible();
    await expect(page.getByText("本机")).toBeVisible();
    await expect(page.getByText("127.0.0.1:19580")).toBeVisible();
  });

  test("connect navigates to console", async ({ page }) => {
    await page.getByTestId("btn-connect").first().click();
    await page.waitForURL(/\/console\/local\//, { timeout: 15000 });
    await expect(page.getByTestId("console-shell")).toBeVisible();
    await expect(page.getByTestId("server-panel")).toBeVisible();
    await expect(page.getByTestId("nav-panel")).toBeVisible();
  });

  test("console toolbar has core actions", async ({ page }) => {
    await page.getByTestId("btn-connect").first().click();
    await page.waitForURL(/\/console\/local\//, { timeout: 15000 });
    await expect(page.getByTestId("btn-start")).toBeVisible();
    await expect(page.getByTestId("btn-save")).toBeVisible();
    await expect(page.getByTestId("btn-write-cfg")).toHaveText("写入游戏配置");
    await expect(page.getByTestId("btn-preflight")).toHaveText("开服检查");
    await expect(page.getByTestId("status-bar")).toBeVisible();
  });

  test("sidebar navigation switches tabs", async ({ page }) => {
    await page.getByTestId("btn-connect").first().click();
    await page.waitForURL(/\/console\/local\//, { timeout: 15000 });

    const tabs = ["mods", "missions", "steamcmd", "logs", "preflight"];
    for (const tab of tabs) {
      await page.getByTestId(`nav-${tab}`).click();
      await expect(page.getByTestId(`nav-${tab}`)).toHaveClass(/active/);
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
    await page.getByTestId("btn-connect").first().click();
    await page.waitForURL(/\/console\/local\//, { timeout: 15000 });
    await page.getByTestId("nav-mods").click();
    await expect(page.getByText("扫描刷新")).toBeVisible();
    await expect(page.getByText("添加模组")).toBeVisible();
  });
});
