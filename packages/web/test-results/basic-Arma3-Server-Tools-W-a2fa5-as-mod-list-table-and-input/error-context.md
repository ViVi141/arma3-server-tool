# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: basic.spec.ts >> Arma3 Server Tools Web UI >> mods page has mod list table and input
- Location: e2e\basic.spec.ts:60:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=模组管理')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=模组管理')

```

```yaml
- menubar:
  - menuitem "连接"
  - menuitem "被控设置"
- text: Arma3 Server Tools
- main:
  - complementary:
    - heading "本机" [level=3]
    - paragraph: http://127.0.0.1:19580
    - separator
    - radiogroup "radio-group":
      - radio "test"
      - text: test
    - separator
    - menubar:
      - menuitem "仪表盘"
      - menuitem "任务"
      - menuitem "模组"
      - menuitem "上传PBO"
      - menuitem "SteamCMD"
      - menuitem "日志"
      - menuitem "配置"
  - main:
    - img
    - paragraph: 请先选择服务器
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Arma3 Server Tools Web UI", () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto("http://localhost:5173");
  6  |   });
  7  | 
  8  |   test("loads the connections page", async ({ page }) => {
  9  |     await expect(page.locator("h2")).toContainText("连接管理");
  10 |   });
  11 | 
  12 |   test("shows localhost default connection", async ({ page }) => {
  13 |     await expect(page.locator("text=本机")).toBeVisible();
  14 |     await expect(page.locator("text=127.0.0.1:19580")).toBeVisible();
  15 |     // Should show a "连接" button
  16 |     await expect(page.locator("text=连接").first()).toBeVisible();
  17 |   });
  18 | 
  19 |   test("can click connect button into local connection", async ({ page }) => {
  20 |     // Click the "连接" button in the table row
  21 |     await page.locator("button:has-text('连接')").first().click();
  22 |     await page.waitForTimeout(3000);
  23 |     // Should navigate to dashboard
  24 |     await expect(page).toHaveURL(/\/console\/local/);
  25 |   });
  26 | 
  27 |   test("dashboard shows after connecting", async ({ page }) => {
  28 |     await page.locator("button:has-text('连接')").first().click();
  29 |     await page.waitForTimeout(3000);
  30 |     // Dashboard with server info should be visible
  31 |     await expect(page.locator("text=服务器").first()).toBeVisible();
  32 |   });
  33 | 
  34 |   test("sidebar navigation works", async ({ page }) => {
  35 |     await page.locator("button:has-text('连接')").first().click();
  36 |     await page.waitForTimeout(2000);
  37 | 
  38 |     // Click through sidebar links
  39 |     const navItems = ["模组", "任务", "上传PBO", "SteamCMD", "日志", "配置"];
  40 |     for (const item of navItems) {
  41 |       await page.click(`text=${item}`);
  42 |       await page.waitForTimeout(500);
  43 |     }
  44 |   });
  45 | 
  46 |   test("can add a connection with custom baseUrl", async ({ page }) => {
  47 |     await page.click("text=+ 添加主机");
  48 |     await page.waitForTimeout(500);
  49 | 
  50 |     await page.fill('input[placeholder="我的服务器"]', "Test Server");
  51 |     await page.fill('input[placeholder="http://127.0.0.1:19580"]', "http://10.0.0.1:19580");
  52 | 
  53 |     await page.locator(".el-dialog button:has-text('添加')").click();
  54 |     await page.waitForTimeout(1000);
  55 | 
  56 |     // Should navigate to the new server's dashboard
  57 |     await expect(page).toHaveURL(/\/console\//);
  58 |   });
  59 | 
  60 |   test("mods page has mod list table and input", async ({ page }) => {
  61 |     await page.locator("button:has-text('连接')").first().click();
  62 |     await page.waitForTimeout(2000);
  63 | 
  64 |     await page.click("text=模组");
  65 |     await page.waitForTimeout(1000);
  66 | 
> 67 |     await expect(page.locator("text=模组管理")).toBeVisible();
     |                                             ^ Error: expect(locator).toBeVisible() failed
  68 |     await expect(page.locator("text=扫描模组")).toBeVisible();
  69 |     await expect(page.locator("text=添加模组")).toBeVisible();
  70 |   });
  71 | });
  72 | 
```