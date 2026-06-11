import { test, expect } from "@playwright/test";

test.describe("Arma3 Server Tools Web UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173");
  });

  test("loads the connections page", async ({ page }) => {
    await expect(page.locator("h2")).toContainText("连接管理");
  });

  test("shows localhost default connection", async ({ page }) => {
    await expect(page.locator("text=本机")).toBeVisible();
    await expect(page.locator("text=127.0.0.1:19580")).toBeVisible();
    // Should show a "连接" button
    await expect(page.locator("text=连接").first()).toBeVisible();
  });

  test("can click connect button into local connection", async ({ page }) => {
    // Click the "连接" button in the table row
    await page.locator("button:has-text('连接')").first().click();
    await page.waitForTimeout(3000);
    // Should navigate to dashboard
    await expect(page).toHaveURL(/\/console\/local/);
  });

  test("dashboard shows after connecting", async ({ page }) => {
    await page.locator("button:has-text('连接')").first().click();
    await page.waitForTimeout(3000);
    // Dashboard with server info should be visible
    await expect(page.locator("text=服务器").first()).toBeVisible();
  });

  test("sidebar navigation works", async ({ page }) => {
    await page.locator("button:has-text('连接')").first().click();
    await page.waitForTimeout(2000);

    // Click through sidebar links
    const navItems = ["模组", "任务", "上传PBO", "SteamCMD", "日志", "配置"];
    for (const item of navItems) {
      await page.click(`text=${item}`);
      await page.waitForTimeout(500);
    }
  });

  test("can add a connection with custom baseUrl", async ({ page }) => {
    await page.click("text=+ 添加主机");
    await page.waitForTimeout(500);

    await page.fill('input[placeholder="我的服务器"]', "Test Server");
    await page.fill('input[placeholder="http://127.0.0.1:19580"]', "http://10.0.0.1:19580");

    await page.locator(".el-dialog button:has-text('添加')").click();
    await page.waitForTimeout(1000);

    // Should navigate to the new server's dashboard
    await expect(page).toHaveURL(/\/console\//);
  });

  test("mods page has mod list table and input", async ({ page }) => {
    await page.locator("button:has-text('连接')").first().click();
    await page.waitForTimeout(2000);

    await page.click("text=模组");
    await page.waitForTimeout(1000);

    await expect(page.locator("text=模组管理")).toBeVisible();
    await expect(page.locator("text=扫描模组")).toBeVisible();
    await expect(page.locator("text=添加模组")).toBeVisible();
  });
});
