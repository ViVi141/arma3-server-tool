import { test, expect, type Page } from "@playwright/test";
import {
  attachErrorGuards,
  connectMockedConsole,
  createDefaultMockMods,
  getTaskBannerLocator,
  getTaskProgressLocator,
  getTaskSnackbarLocator,
  navigateConsoleTab,
  type MockModRow,
} from "./helpers";

async function startFirstModDownload(page: Page): Promise<void> {
  const firstUpdateCheckbox = page
    .locator('.mods-archive-table tbody tr .el-checkbox:not(.is-disabled), [data-testid="mods-card-list"] .el-checkbox:not(.is-disabled)')
    .first();
  await expect(firstUpdateCheckbox).toBeVisible();
  await firstUpdateCheckbox.click();
  await expect(firstUpdateCheckbox.locator('input[type="checkbox"]')).toBeChecked();

  const downloadBtn = page.getByRole("button", { name: "更新/下载选中" });
  await expect(downloadBtn).toBeEnabled();
  await downloadBtn.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const confirmBtn = dialog.getByRole("button", { name: "开始下载" });
  await expect(confirmBtn).toBeEnabled();
  await confirmBtn.click();
}

test.describe("F8: Non-Blocking Background Task & M3 Snackbar (Tier 1)", () => {
  test("F8-T1-01 triggering mod download shows non-blocking bg-task-banner or m3-snackbar", async ({ page }) => {
    const mock = await connectMockedConsole(page, { asyncPollsBeforeComplete: 4 });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);

    await expect
      .poll(() => mock.getRequests("POST", "/api/v1/task").length)
      .toBeGreaterThan(0);

    const banner = getTaskBannerLocator(page);
    const snackbar = getTaskSnackbarLocator(page);
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toHaveAttribute("role", "region");
    await expect(snackbar).toBeVisible({ timeout: 10000 });
    await expect(snackbar).toHaveAttribute("role", "status");
  });

  test("F8-T1-02 user remains on ModsView during active background download without redirect", async ({ page }) => {
    await connectMockedConsole(page, { asyncPollsBeforeComplete: 4 });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);

    await expect(getTaskProgressLocator(page)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/mods/);
    await expect(page).not.toHaveURL(/\/steamcmd/);
    await expect(page.getByText("扫描刷新")).toBeVisible();
  });

  test("F8-T1-03 background task progress banner persists across tab navigation", async ({ page }) => {
    await connectMockedConsole(page, { asyncPollsBeforeComplete: 6 });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);

    const progress = getTaskProgressLocator(page);
    await expect(progress).toBeVisible({ timeout: 10000 });

    await navigateConsoleTab(page, "dashboard");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await expect(progress).toBeVisible();

    await navigateConsoleTab(page, "logs");
    await expect(progress).toBeVisible();
  });

  test("F8-T1-04 task completion transitions banner to success and allows dismissal", async ({ page }) => {
    await connectMockedConsole(page, {
      asyncPollsBeforeComplete: 1,
      asyncFinalStatus: "Succeeded",
    });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);

    const banner = getTaskBannerLocator(page);
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toContainText(/完成|成功|Succeeded/i, { timeout: 15000 });

    const dismissBtn = banner
      .locator('[aria-label*="关闭"], button:has-text("关闭"), button:has-text("知道了")')
      .or(banner.locator("button").last())
      .first();
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();
    await expect(banner).not.toBeVisible();
  });

  test("F8-T1-05 active background task does not block editing fields in other tabs", async ({ page }) => {
    await connectMockedConsole(page, { asyncPollsBeforeComplete: 6 });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);
    await expect(getTaskProgressLocator(page)).toBeVisible({ timeout: 10000 });

    await navigateConsoleTab(page, "basic");
    const hostInput = page.locator(".form-row", { hasText: "服务器名" }).locator("input").first();
    await expect(hostInput).toBeEditable();
    await hostInput.fill("Editable While Downloading");
    await expect(hostInput).toHaveValue("Editable While Downloading");
  });
});

test.describe("F8: Non-Blocking Background Task & M3 Snackbar (Tier 2)", () => {
  test("F8-T2-01 background task failure surfaces error message without crashing", async ({ page }) => {
    const guards = attachErrorGuards(page, { ignoreNetworkHttpErrors: true });
    await connectMockedConsole(page, {
      asyncPollsBeforeComplete: 1,
      asyncFinalStatus: "Failed",
      asyncErrorText: "Steam timeout",
    });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);

    const progress = getTaskProgressLocator(page);
    await expect(progress).toBeVisible({ timeout: 10000 });
    await expect(progress).toContainText(/Steam timeout|失败|Failed/i, { timeout: 15000 });
    expect(guards.pageErrors).toEqual([]);
  });

  test("F8-T2-02 multiple consecutive background tasks are tracked cleanly", async ({ page }) => {
    const mock = await connectMockedConsole(page, { asyncPollsBeforeComplete: 5 });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);
    await expect(getTaskProgressLocator(page)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: "更新/下载选中" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const confirmBtn = dialog.getByRole("button", { name: "开始下载" });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await expect
      .poll(() => mock.getRequests("POST", "/api/v1/task").length)
      .toBeGreaterThanOrEqual(2);
    await expect(getTaskProgressLocator(page)).toBeVisible();
  });

  test("F8-T2-03 cancelled background task transitions cleanly out of running state", async ({ page }) => {
    await connectMockedConsole(page, {
      asyncPollsBeforeComplete: 1,
      asyncFinalStatus: "Cancelled",
    });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);

    const progress = getTaskProgressLocator(page);
    await expect(progress).toBeVisible({ timeout: 10000 });
    await expect(progress).toContainText(/取消|Cancelled/i, { timeout: 15000 });
  });

  test("F8-T2-04 mobile 390x844 snackbar stays inside viewport bounds without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connectMockedConsole(page, { asyncPollsBeforeComplete: 5 });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);

    const progress = getTaskProgressLocator(page);
    await expect(progress).toBeVisible({ timeout: 10000 });
    const box = await progress.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
  });

  test("F8-T2-05 task completion refreshes ModsView mod list in place", async ({ page }) => {
    const mock = await connectMockedConsole(page, {
      asyncPollsBeforeComplete: 1,
      asyncFinalStatus: "Succeeded",
    });
    await navigateConsoleTab(page, "mods");
    const modsGetsBefore = mock.getRequests("GET", "/mods").length;

    await startFirstModDownload(page);
    await expect
      .poll(() => mock.getRequests("GET", "/mods").length, { timeout: 15000 })
      .toBeGreaterThan(modsGetsBefore);
  });
});

test.describe("F11: Mods Filter Chips, Role Tags & Non-Blocking DL (Tier 1)", () => {
  test("F11-T1-01 four M3 Filter Chips present and selectable", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");

    const chipIds = [
      "mods-filter-all",
      "mods-filter-enabled",
      "mods-filter-outdated",
      "mods-filter-bikey-issue",
    ];
    for (const id of chipIds) {
      const chip = page.getByTestId(id);
      await expect(chip).toBeVisible();
      await chip.click();
      await expect(chip).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("F11-T1-02 已启用 filter chip filters strictly to enabled mods", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");

    await page.getByTestId("mods-filter-enabled").click();
    await expect(page.getByText("CBA_A3", { exact: true })).toBeVisible();
    await expect(page.getByText("ACE3", { exact: true })).toBeVisible();
    await expect(page.getByText("UnsignedMod", { exact: true })).toBeVisible();
    await expect(page.getByText("TFAR", { exact: true })).not.toBeVisible();
  });

  test("F11-T1-03 有更新 filter chip filters strictly to outdated mods", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");

    await page.getByTestId("mods-filter-outdated").click();
    await expect(page.getByText("ACE3", { exact: true })).toBeVisible();
    await expect(page.getByText("CBA_A3", { exact: true })).not.toBeVisible();
    await expect(page.getByText("TFAR", { exact: true })).not.toBeVisible();
  });

  test("F11-T1-04 签名异常 filter chip filters strictly to bikey issue mods", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");

    await page.getByTestId("mods-filter-bikey-issue").click();
    await expect(page.getByText("TFAR", { exact: true })).toBeVisible();
    await expect(page.getByText("UnsignedMod", { exact: true })).toBeVisible();
    await expect(page.getByText("CBA_A3", { exact: true })).not.toBeVisible();
    await expect(page.getByText("ACE3", { exact: true })).not.toBeVisible();
  });

  test("F11-T1-05 clickable role tags respond with immediate UI and PATCH feedback", async ({ page }) => {
    const mock = await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");
    const patchesBefore = mock.getRequests("PATCH", "/config").length;

    const roleTag = page.locator('[data-testid^="mod-role-"], .el-switch').first();
    await expect(roleTag).toBeVisible();
    await roleTag.click();

    await expect
      .poll(() => mock.getRequests("PATCH", "/config").length)
      .toBeGreaterThan(patchesBefore);
  });

  test("F11-T1-06 download action executes non-blocking on ModsView", async ({ page }) => {
    const mock = await connectMockedConsole(page, { asyncPollsBeforeComplete: 4 });
    await navigateConsoleTab(page, "mods");
    await startFirstModDownload(page);

    await expect
      .poll(() => mock.getRequests("POST", "/api/v1/task").length)
      .toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/mods/);
    await expect(getTaskProgressLocator(page)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("F11: Mods Filter Chips, Role Tags & Non-Blocking DL (Tier 2)", () => {
  test("F11-T2-01 zero mods empty list renders clean empty state across all filter chips", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page, { mods: [] });
    await navigateConsoleTab(page, "mods");

    for (const id of [
      "mods-filter-all",
      "mods-filter-enabled",
      "mods-filter-outdated",
      "mods-filter-bikey-issue",
    ]) {
      await page.getByTestId(id).click();
      await expect(page.getByText("共 0 项")).toBeVisible();
    }
    guards.assertClean();
  });

  test("F11-T2-02 all-unsigned bikey list matches bikey-issue chip and disables copy missing", async ({ page }) => {
    const mods: MockModRow[] = createDefaultMockMods().map((m) => ({
      ...m,
      bikeyStatus: "unsigned",
      bikeyLabel: "未签名",
    }));
    await connectMockedConsole(page, { mods });
    await navigateConsoleTab(page, "mods");

    await page.getByTestId("mods-filter-bikey-issue").click();
    await expect(page.getByText(`共 ${mods.length} 项`)).toBeVisible();
    await expect(page.getByTestId("btn-copy-missing-bikey")).toBeDisabled();
  });

  test("F11-T2-03 all-outdated vs zero-outdated boundary on mods-filter-outdated", async ({ page }) => {
    const allOutdated = createDefaultMockMods().map((m) => ({
      ...m,
      updateStatus: "outdated" as const,
    }));
    const mock = await connectMockedConsole(page, { mods: allOutdated });
    await navigateConsoleTab(page, "mods");

    await page.getByTestId("mods-filter-outdated").click();
    await expect(page.getByText(`共 ${allOutdated.length} 项`)).toBeVisible();

    mock.setMods(
      allOutdated.map((m) => ({
        ...m,
        updateStatus: "up_to_date" as const,
      }))
    );
    await page.getByRole("button", { name: "扫描刷新" }).click();
    await expect(page.getByText("共 0 项")).toBeVisible();
  });

  test("F11-T2-04 local-only mod workshopId <= 0 disables update selection checkbox", async ({ page }) => {
    const mods: MockModRow[] = [
      {
        workshopId: 0,
        name: "LocalCustomMod",
        dirName: "@LocalCustomMod",
        path: "C:\\arma3\\mods\\@LocalCustomMod",
        enabled: true,
        isClientMod: true,
        isServerMod: false,
        isHcMod: false,
        bikeyStatus: "ready",
        bikeyLabel: "验证通过",
        scanOrder: 0,
        updatedTime: "2026-11-01 10:00",
        isLocalMod: true,
        inputLocalMod: true,
      },
    ];
    await connectMockedConsole(page, { mods });
    await navigateConsoleTab(page, "mods");

    const localCheckbox = page
      .locator('.mods-archive-table tbody tr input[type="checkbox"], [data-testid="mods-card-list"] input[type="checkbox"]')
      .first();
    await expect(localCheckbox).toBeAttached();
    await expect(localCheckbox).toBeDisabled();
  });

  test("F11-T2-05 filter chip combined with sort mode preserves filtered subset order", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");

    await page.getByTestId("mods-filter-enabled").click();
    await expect(page.getByText("共 3 项")).toBeVisible();

    const sortTrigger = page.locator(".mods-bar--first .el-select").first();
    await sortTrigger.click();
    await page.getByRole("option", { name: "模组名" }).click();

    await expect(page.getByText("共 3 项")).toBeVisible();
    await expect(page.getByText("TFAR", { exact: true })).not.toBeVisible();
  });

  test("F11-T2-06 mobile 390x844 ModsView fits without horizontal overflow and allows role toggle", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const mock = await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");

    await expect(page.getByTestId("mods-filter-all")).toBeVisible();
    const roleControl = page.locator('[data-testid^="mod-role-"], .el-switch').first();
    await expect(roleControl).toBeVisible();
    await roleControl.click();

    await expect
      .poll(() => mock.getRequests("PATCH", "/config").length)
      .toBeGreaterThan(0);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
  });
});
