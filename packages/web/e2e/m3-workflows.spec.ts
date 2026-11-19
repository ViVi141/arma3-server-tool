import { test, expect, type Page } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  attachErrorGuards,
  connectConsole,
  connectMockedConsole,
  getRelativeLuminance,
  getTaskProgressLocator,
  installMockApi,
  navigateConsoleTab,
  openCommandPalette,
  openFirstServerWizard,
  openInstanceMenu,
  setThemeMode,
} from "./helpers";

async function startFirstModDownload(page: Page): Promise<void> {
  // Element Plus 的原生 input 是视觉隐藏的（0x0），只能对 .el-checkbox 外壳断言与点击
  const firstUpdateCheckbox = page
    .locator('.mods-archive-table tbody tr .el-checkbox:not(.is-disabled), [data-testid="mods-card-list"] .el-checkbox:not(.is-disabled)')
    .first();
  await expect(firstUpdateCheckbox).toBeVisible();
  await firstUpdateCheckbox.click();
  await expect(firstUpdateCheckbox.locator('input[type="checkbox"]')).toBeChecked();

  await page.getByRole("button", { name: "更新/下载选中" }).click();

  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "开始下载" }).click();
  }
}

test.describe("Tier 3: Cross-Feature Pairwise Combinations (14 Cases)", () => {
  test("T3-01 theme toggle + SVG icons + M3 tokens on mobile 390x844", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await connectMockedConsole(page);

    await setThemeMode(page, "light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await setThemeMode(page, "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    const svgColor = await page
      .getByTestId("mode-overview")
      .locator("svg")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(getRelativeLuminance(svgColor)).toBeGreaterThan(0.35);
    await assertNoHorizontalOverflow(page);
    guards.assertClean();
  });

  test("T3-02 theme toggle + Ctrl+K command palette across 1280x720 and 390x844", async ({ page }) => {
    await connectMockedConsole(page);
    await setThemeMode(page, "dark");
    await openCommandPalette(page, "shortcut");

    const palette = page.getByTestId("command-palette");
    const blur = await palette.evaluate((el) => {
      const cs = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
      return cs.backdropFilter || cs.webkitBackdropFilter || "none";
    });
    expect(blur === "none" || blur === "").toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    const box = await palette.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
    await page.keyboard.press("Escape");
  });

  test("T3-03 unsaved dirty config + Ctrl+K navigation triggers UnsavedChangesDialog", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    const hostInput = page.locator(".form-row", { hasText: "服务器名" }).locator("input").first();
    await hostInput.fill("Dirty Palette Jump");

    await openCommandPalette(page, "shortcut");
    await page.getByTestId("command-palette-input").fill("模组");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("command-palette")).not.toBeVisible();
    const guardDialog = page.getByRole("dialog", { name: "未保存的更改" });
    await expect(guardDialog).toBeVisible();
    await guardDialog.getByRole("button", { name: "取消" }).click();

    await expect(page).toHaveURL(/\/basic/);
    await expect(hostInput).toHaveValue("Dirty Palette Jump");
  });

  test("T3-04 dirty deferred Checkbox + sync-banner save-and-write clears guard", async ({ page }) => {
    const mock = await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");

    const battleyeRow = page.locator(".form-row", { hasText: "BattlEye" }).first();
    await battleyeRow.locator('label, input[type="checkbox"], [role="checkbox"]').first().click();

    const banner = page.getByTestId("sync-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("button").evaluate((el) => (el as HTMLElement).click());

    await expect
      .poll(() => mock.getRequests("POST", "/api/v1/task").length)
      .toBeGreaterThan(0);
    await expect(banner).not.toBeVisible();

    await page.getByTestId("nav-connections").click();
    await expect(page.getByRole("dialog", { name: "未保存的更改" })).not.toBeVisible();
    await expect(page).toHaveURL(/#\/connections/);
  });

  test("T3-05 dirty Checkbox in StatisticsView + browser Back guard saves and completes", async ({ page }) => {
    const mock = await connectMockedConsole(page, { showAdvancedSettings: true });
    await navigateConsoleTab(page, "statistics");
    await page.getByRole("tab", { name: "监控设置" }).click();

    // 原生 input 在 Element Plus 里是视觉隐藏的，点可见的 .el-checkbox 外壳
    const monitorRow = page.locator(".form-row", { hasText: "启用监控" }).first();
    const toggle = monitorRow.locator(".el-checkbox").first();
    await expect(toggle).toBeVisible();
    await toggle.click();

    await page.goBack();
    const dialog = page.getByRole("dialog", { name: "未保存的更改" });
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("btn-unsaved-save").click();

    await expect
      .poll(() => mock.getRequests("PATCH", "/config").length)
      .toBeGreaterThan(0);
    await expect(page).not.toHaveURL(/\/statistics/);
  });

  test("T3-06 Mods non-blocking download persists snackbar across Dashboard and Logs", async ({ page }) => {
    await connectMockedConsole(page, { asyncPollsBeforeComplete: 6 });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);

    await expect(page).toHaveURL(/\/mods/);
    const progress = getTaskProgressLocator(page);
    await expect(progress).toBeVisible({ timeout: 10000 });

    await navigateConsoleTab(page, "dashboard");
    await expect(progress).toBeVisible();

    await navigateConsoleTab(page, "logs");
    await expect(progress).toBeVisible();
  });

  test("T3-07 Ctrl+K jump to Mods + bikey-issue filter chip + clickable role tag toggle", async ({ page }) => {
    const mock = await connectMockedConsole(page);
    await openCommandPalette(page, "shortcut");
    await page.getByTestId("command-palette-input").fill("模组");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/mods/);

    await page.getByTestId("mods-filter-bikey-issue").click();
    await expect(page.getByText("TFAR", { exact: true })).toBeVisible();

    const patchesBefore = mock.getRequests("PATCH", "/config").length;
    await page.locator('[data-testid^="mod-role-"], .el-switch').first().click();
    await expect
      .poll(() => mock.getRequests("PATCH", "/config").length)
      .toBeGreaterThan(patchesBefore);
  });

  test("T3-08 Dark and Light Chart.js canvas theme reactivity on StatisticsView", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page, { showAdvancedSettings: true });
    await setThemeMode(page, "light");
    await navigateConsoleTab(page, "statistics");

    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible();

    await setThemeMode(page, "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    guards.assertClean();
  });

  test("T3-09 Settings 2-col responsive grid + deferred Checkboxes at 1280x720 vs 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");

    const rowA = page.locator(".form-row", { hasText: "服务器名" }).first();
    const rowB = page.locator(".form-row", { hasText: "最大玩家" }).first();
    const desktopA = await rowA.boundingBox();
    const desktopB = await rowB.boundingBox();
    expect(desktopA).not.toBeNull();
    expect(desktopB).not.toBeNull();
    expect(Math.abs(desktopA!.y - desktopB!.y)).toBeLessThan(12);
    await assertNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileA = await rowA.boundingBox();
    const mobileB = await rowB.boundingBox();
    expect(mobileA).not.toBeNull();
    expect(mobileB).not.toBeNull();
    expect(mobileB!.y).toBeGreaterThanOrEqual(mobileA!.y + mobileA!.height - 2);
    await assertNoHorizontalOverflow(page);

    // Element Plus 的原生 input 被视觉隐藏，可断言的可见元素是 .el-checkbox 外壳
    const battleyeCb = page.locator(".form-row", { hasText: "BattlEye" }).locator(".el-checkbox").first();
    await expect(battleyeCb).toBeVisible();
    await expect(battleyeCb.locator('input[type="checkbox"]')).toBeAttached();
  });

  test("T3-10 action consolidation + rail SVG icons across overview, deploy, and config", async ({ page }) => {
    await connectMockedConsole(page);
    await expect(page.getByRole("button", { name: "启动" })).toHaveCount(1);
    // 概览页没有页内编辑器：保存不出现，配置动作统一收敛到「应用更改」。
    await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("btn-apply")).toHaveCount(1);
    await expect(page.getByTestId("btn-apply")).toHaveText("应用更改");

    await navigateConsoleTab(page, "preflight");
    await expect(page.locator(".shell-v2__actions [data-testid='btn-preflight']")).toHaveText("开服检查");

    await navigateConsoleTab(page, "basic");
    await expect(page.getByTestId("mode-config").locator("svg").first()).toBeVisible();
  });

  test("T3-11 mobile 390x844 DashboardView and action cluster fit without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connectMockedConsole(page);
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await assertNoHorizontalOverflow(page);

    const moreMenu = page.getByTestId("btn-mobile-more-actions");
    if (await moreMenu.isVisible().catch(() => false)) {
      await moreMenu.click();
      await expect(page.getByRole("menuitem", { name: "重新读取配置" })).toBeVisible();
    }
    await expect(page.getByTestId("btn-apply")).toBeVisible();
    await expect(page.getByTestId("btn-apply")).toHaveText("应用更改");
  });

  test("T3-12 active background task + Ctrl+K quick jump to RPT Logs keeps progress intact", async ({ page }) => {
    await connectMockedConsole(page, { asyncPollsBeforeComplete: 6 });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);

    const progress = getTaskProgressLocator(page);
    await expect(progress).toBeVisible({ timeout: 10000 });

    await openCommandPalette(page, "shortcut");
    await page.getByTestId("command-palette-input").fill("RPT");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/logs/);
    await expect(progress).toBeVisible();
  });

  test("T3-13 HTML mod-list upload -> enable mods -> filter 已启用 chip", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");

    await page.getByRole("button", { name: "获取模组" }).click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "从 HTML 启用..." }).click();
    const chooser = await chooserPromise;

    const html = `<html><body><table>
      <tr data-type="ModContainer"><td data-type="DisplayName">TFAR</td><td><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=620019431">TFAR</a></td></tr>
    </table></body></html>`;
    await chooser.setFiles({
      name: "team-preset.html",
      mimeType: "text/html",
      buffer: Buffer.from(html, "utf-8"),
    });

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("button.el-button--primary").last().click();

    await page.getByTestId("mods-filter-enabled").click();
    await expect(page.getByText("TFAR", { exact: true })).toBeVisible();
  });

  test("T3-14 server rename reflects consistently across server-panel, basic, and reload", async ({ page }) => {
    await connectMockedConsole(page);
    await openInstanceMenu(page);
    await page.getByTestId("server-list").getByRole("button", { name: "重命名" }).click();

    const msgBox = page.locator(".el-message-box");
    await msgBox.locator("input").fill("Consistently-Renamed");
    // 重命名弹窗确认按钮文案是「保存」（ElMessageBox.prompt confirmButtonText）
    await msgBox.getByRole("button", { name: "保存", exact: true }).click();

    await expect(page.getByTestId("server-panel")).toContainText("Consistently-Renamed");
    await navigateConsoleTab(page, "basic");
    await expect(page.locator(".form-row", { hasText: "配置名称" }).locator("input").first()).toHaveValue(
      "Consistently-Renamed"
    );
  });
});

test.describe("Tier 4: Real-World Application Scenarios (8 Full E2E Workflows)", () => {
  test("T4-01 First-Time Operator Setup & Preflight Readiness", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await installMockApi(page, { servers: [] });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("connections-page").getByRole("heading", { name: "主机连接", exact: true })).toBeVisible();
    await expect(page.getByTestId("connection-row-local")).toBeVisible();
    await connectConsole(page);

    await openFirstServerWizard(page);
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-config-name").fill("Prod-Altis-01");
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-opt-install-dedicated").uncheck();
    await page.getByTestId("wizard-opt-ensure-steamcmd").uncheck();
    await page.getByTestId("wizard-opt-write-cfg").uncheck();
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-finish").click();

    await expect(page.getByTestId("dashboard-page")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("server-panel")).toContainText("Prod-Altis-01");

    await page.getByTestId("dashboard-preflight").click();
    await expect(page.getByTestId("preflight-page")).toBeVisible();
    await expect(page.locator(".shell-v2__actions [data-testid='btn-preflight']")).toHaveText("开服检查");
    await page.getByRole("button", { name: /开始检查/ }).click();
    await expect(page.getByText("server.cfg 校验通过")).toBeVisible();
    guards.assertClean();
  });

  test("T4-02 Full Config Editing Lifecycle with Guard, Sync Banner & Ctrl+K Search", async ({ page }) => {
    const guards = attachErrorGuards(page);
    const mock = await connectMockedConsole(page);

    await openCommandPalette(page, "shortcut");
    await page.getByTestId("command-palette-input").fill("基本");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/basic/);

    const hostInput = page.locator(".form-row", { hasText: "服务器名" }).locator("input").first();
    await hostInput.fill("Prod Altis Tactical");
    const battleyeRow = page.locator(".form-row", { hasText: "BattlEye" }).first();
    await battleyeRow.locator('label, input[type="checkbox"], [role="checkbox"]').first().click();

    expect(mock.getRequests("PATCH", "/config").length).toBe(0);

    await page.getByTestId("nav-connections").click();
    const guardDialog = page.getByRole("dialog", { name: "未保存的更改" });
    await expect(guardDialog).toBeVisible();
    await guardDialog.getByRole("button", { name: "取消" }).click();
    await expect(hostInput).toHaveValue("Prod Altis Tactical");

    await page.getByTestId("btn-page-save").click();
    await expect
      .poll(() => mock.getRequests("PATCH", "/config").length)
      .toBeGreaterThan(0);

    const banner = page.getByTestId("sync-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("button").click();
    await expect.poll(() => mock.getRequests("POST", "/api/v1/task").length).toBeGreaterThan(0);
    await expect(banner).not.toBeVisible();

    await page.getByTestId("nav-connections").click();
    await expect(page).toHaveURL(/#\/connections/);
    guards.assertClean();
  });

  test("T4-03 Mod Curation, Role Assignment & Non-Blocking Download Across Tabs", async ({ page }) => {
    const guards = attachErrorGuards(page);
    const mock = await connectMockedConsole(page, {
      showAdvancedSettings: true,
      asyncPollsBeforeComplete: 4,
    });

    await openCommandPalette(page, "shortcut");
    await page.getByTestId("command-palette-input").fill("模组");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/mods/);

    await page.getByTestId("mods-filter-bikey-issue").click();
    await expect(page.getByText("TFAR", { exact: true })).toBeVisible();
    await page.getByTestId("mods-filter-outdated").click();
    await expect(page.getByText("ACE3")).toBeVisible();

    await page.locator('[data-testid^="mod-role-"], .el-switch').first().click();
    await expect
      .poll(() => mock.getRequests("PATCH", "/config").length)
      .toBeGreaterThan(0);

    await page.getByTestId("mods-filter-all").click();
    await startFirstModDownload(page);
    await expect(page).toHaveURL(/\/mods/);

    const progress = getTaskProgressLocator(page);
    await expect(progress).toBeVisible({ timeout: 10000 });

    await navigateConsoleTab(page, "logs");
    await expect(progress).toBeVisible();

    await navigateConsoleTab(page, "statistics");
    await expect(page.locator("canvas")).toHaveCount(2);
    await expect(progress).toContainText(/完成|成功|Succeeded/i, { timeout: 15000 });
    guards.assertClean();
  });

  test("T4-04 Mobile Field-Admin Emergency Workflow at 390x844", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await connectMockedConsole(page, { asyncPollsBeforeComplete: 5 });

    await setThemeMode(page, "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await assertNoHorizontalOverflow(page);

    await navigateConsoleTab(page, "basic");
    await assertNoHorizontalOverflow(page);
    await page.locator(".form-row", { hasText: "BattlEye" }).locator('label, input[type="checkbox"]').first().click();

    await page.getByTestId("mode-workshop").click();
    const guardDialog = page.getByRole("dialog", { name: "未保存的更改" });
    await expect(guardDialog).toBeVisible();
    await guardDialog.getByTestId("btn-unsaved-save").click();

    await expect(page.getByText("扫描刷新")).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await startFirstModDownload(page);
    const progress = getTaskProgressLocator(page);
    await expect(progress).toBeVisible({ timeout: 10000 });
    const snackBox = await progress.boundingBox();
    expect(snackBox).not.toBeNull();
    expect(snackBox!.x + snackBox!.width).toBeLessThanOrEqual(391);

    await navigateConsoleTab(page, "logs");
    await assertNoHorizontalOverflow(page);
    guards.assertClean();
  });

  test("T4-05 Multi-Server Creation, Rename & Dark/Light Theme Persistence Audit", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);

    await openInstanceMenu(page);
    await page.getByTestId("btn-new-server").click();
    await page.getByTestId("new-server-name").fill("Secondary-Tanoa");
    await page.getByTestId("new-server-confirm").click();
    await expect(page.getByTestId("server-panel")).toContainText("Secondary-Tanoa");

    await openInstanceMenu(page);
    // 下拉内容随状态刷新重建，常规 click 会卡在 "element is not stable"
    await page
      .getByTestId("server-list")
      .getByRole("button", { name: "重命名" })
      .evaluate((el) => (el as HTMLElement).click());
    const msgBox = page.locator(".el-message-box");
    await msgBox.locator("input").fill("Tanoa-Ops-02");
    // 重命名弹窗确认按钮文案是「保存」（ElMessageBox.prompt confirmButtonText）
    await msgBox.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByTestId("server-panel")).toContainText("Tanoa-Ops-02");

    await setThemeMode(page, "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await openInstanceMenu(page);
    await page.getByTestId("server-item-srv-e2e-1").click();
    await expect(page.getByTestId("server-panel")).toContainText("E2E Mock Server");
    guards.assertClean();
  });

  test("T4-06 HTML Preset Import -> Bikey Inspection -> Config Write Pipeline", async ({ page }) => {
    const guards = attachErrorGuards(page);
    const mock = await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");

    await page.getByRole("button", { name: "获取模组" }).click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "从 HTML 启用..." }).click();
    const chooser = await chooserPromise;

    const html = `<html><body><table>
      <tr data-type="ModContainer"><td data-type="DisplayName">ImportedOpMod</td><td><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=777888999">Mod</a></td></tr>
    </table></body></html>`;
    await chooser.setFiles({
      name: "op-mods.html",
      mimeType: "text/html",
      buffer: Buffer.from(html, "utf-8"),
    });

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("button.el-button--primary").last().click();

    await page.getByTestId("mods-filter-enabled").click();
    await expect(page.getByText("777888999").or(page.getByText("workshop_777888999")).first()).toBeVisible();

    // 没有缺失的 bikey 时按钮是 disabled（这是正确状态），只在可点击时才点
    const copyMissing = page.getByTestId("btn-copy-missing-bikey");
    if (await copyMissing.isEnabled()) {
      await copyMissing.click();
    }
    // 「应用更改」属于配置类动作，工坊模式下按设计不显示，先切到配置页
    await navigateConsoleTab(page, "basic");
    await expect(page.getByTestId("btn-apply")).toBeVisible();
    await page.getByTestId("btn-apply").click();

    await expect
      .poll(() => mock.getRequests("POST", "/api/v1/task").length)
      .toBeGreaterThan(0);
    guards.assertClean();
  });

  test("T4-07 Live Monitoring, Chart.js Statistics & Snapshots Recovery", async ({ page }) => {
    const guards = attachErrorGuards(page);
    const mock = await connectMockedConsole(page, { showAdvancedSettings: true });
    await navigateConsoleTab(page, "statistics");

    await expect(page.locator("canvas")).toHaveCount(2);
    await page.getByRole("button", { name: "导出 CSV..." }).click();

    await page.getByRole("tab", { name: "监控设置" }).click();
    await page.getByRole("button", { name: "立即采集" }).click();
    await expect
      .poll(() => mock.getRequests("POST", "/api/v1/monitoring/collect").length)
      .toBeGreaterThan(0);

    await navigateConsoleTab(page, "snapshots");
    await page.getByPlaceholder("快照备注").fill("pre-change");
    await page.getByRole("button", { name: "创建快照" }).click();
    await expect(page.getByText("pre-change")).toBeVisible();

    await page.getByRole("button", { name: "恢复" }).first().click();
    await page.locator(".el-message-box").getByRole("button", { name: "恢复" }).click();
    await expect
      .poll(() => mock.getRequests("POST", "/restore").length)
      .toBeGreaterThan(0);
    guards.assertClean();
  });

  test("T4-08 Full-Site Dark/Light Accessibility, Reduced-Motion & Zero-Overflow Sweep", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installMockApi(page, { showAdvancedSettings: true });

    const viewports = [
      { width: 1280, height: 720 },
      { width: 1024, height: 768 },
      { width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await setThemeMode(page, vp.width === 390 ? "dark" : "light");
      await assertNoHorizontalOverflow(page);

      await page.goto("/#/settings/host");
      await page.waitForLoadState("networkidle");
      await assertNoHorizontalOverflow(page);

      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.getByTestId("btn-connect").first().click();
      await expect(page.getByTestId("console-shell")).toBeVisible();

      for (const tab of ["dashboard", "basic", "mods", "logs", "preflight", "statistics"]) {
        await navigateConsoleTab(page, tab);
        await assertNoHorizontalOverflow(page);
      }
    }

    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewportMeta?.toLowerCase()).not.toContain("maximum-scale=1");
    guards.assertClean();
  });
});
