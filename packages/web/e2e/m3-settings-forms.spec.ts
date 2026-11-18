import { test, expect } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  attachErrorGuards,
  connectConsole,
  connectMockedConsole,
  navigateConsoleTab,
} from "./helpers";

test.describe("F9: Settings Layout & Responsive 2-Column M3 Forms (Tier 1)", () => {
  test("F9-T1-01 btn-page-save is visible and saves config across settings views", async ({ page }) => {
    const mock = await connectMockedConsole(page);
    for (const tab of ["basic", "performance", "network", "security", "difficulty", "log"]) {
      await navigateConsoleTab(page, tab);
      const saveBtn = page.getByTestId("btn-page-save");
      await expect(saveBtn).toBeVisible();
      if (tab === "basic") {
        await saveBtn.click();
        await expect
          .poll(() => mock.getRequests("PATCH", "/config").length)
          .toBeGreaterThan(0);
      }
    }
  });

  test("F9-T1-02 wide desktop 1280x720 settings form renders 2-column grid", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    await expect(page.getByTestId("btn-page-save")).toBeVisible();

    const rowA = page.locator(".form-row", { hasText: "服务器名" }).first();
    const rowB = page.locator(".form-row", { hasText: "最大玩家" }).first();
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    const rectA = await rowA.boundingBox();
    const rectB = await rowB.boundingBox();
    expect(rectA).not.toBeNull();
    expect(rectB).not.toBeNull();
    expect(Math.abs(rectA!.y - rectB!.y)).toBeLessThan(12);
    expect(rectB!.x).toBeGreaterThan(rectA!.x + rectA!.width - 4);
  });

  test("F9-T1-03 full-width textarea spans wider than single-column field cleanly", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");

    const singleField = page.locator(".form-row", { hasText: "服务器名" }).first();
    const wideField = page.locator(".form-row", { hasText: "欢迎语" }).first();
    await expect(wideField).toBeVisible();

    const singleRect = await singleField.boundingBox();
    const wideRect = await wideField.boundingBox();
    expect(singleRect).not.toBeNull();
    expect(wideRect).not.toBeNull();
    expect(wideRect!.width).toBeGreaterThan(singleRect!.width * 1.2);
  });

  test("F9-T1-04 borderless quiet M3 sections remove boxed card borders", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");

    const panel = page.locator("section, .ark-panel, .m3-section").filter({ hasText: "服务器" }).first();
    await expect(panel).toBeVisible();
    const styles = await panel.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        borderTopWidth: cs.borderTopWidth,
        borderLeftWidth: cs.borderLeftWidth,
        boxShadow: cs.boxShadow,
      };
    });
    expect(styles.boxShadow === "none" || styles.boxShadow === "").toBe(true);
    expect(styles.borderLeftWidth).toBe("0px");
  });

  test("F9-T1-05 ultra-wide 1600x900 viewport constrains readable field widths", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");

    const inputRect = await page
      .locator(".form-row", { hasText: "服务器名" })
      .locator("input")
      .first()
      .boundingBox();
    expect(inputRect).not.toBeNull();
    expect(inputRect!.width).toBeLessThanOrEqual(560);
    await assertNoHorizontalOverflow(page);
  });
});

test.describe("F9: Settings Layout & Responsive 2-Column M3 Forms (Tier 2)", () => {
  test("F9-T2-01 responsive collapse at <= 1024px stacks 2-col grid to 1-col", async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 720 });
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");

    const rowA = page.locator(".form-row", { hasText: "服务器名" }).first();
    const rowB = page.locator(".form-row", { hasText: "最大玩家" }).first();
    const rectA = await rowA.boundingBox();
    const rectB = await rowB.boundingBox();
    expect(rectA).not.toBeNull();
    expect(rectB).not.toBeNull();
    expect(rectB!.y).toBeGreaterThanOrEqual(rectA!.y + rectA!.height - 2);
    await assertNoHorizontalOverflow(page);
  });

  test("F9-T2-02 mobile 390x844 stacks settings labels above controls without overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    await expect(page.getByTestId("btn-page-save")).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.goto("/#/settings/host");
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalOverflow(page);
  });

  test("F9-T2-03 numeric boundaries on port (1024 and 65535) and long labels fit cleanly", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");

    const portInput = page.locator(".form-row", { hasText: "端口" }).locator("input").first();
    await portInput.fill("1024");
    await expect(portInput).toHaveValue("1024");
    await portInput.fill("65535");
    await expect(portInput).toHaveValue("65535");
    await assertNoHorizontalOverflow(page);
  });

  test("F9-T2-04 small vs large settings views render consistent btn-page-save header and scroll", async ({ page }) => {
    await connectMockedConsole(page);
    for (const tab of ["log", "difficulty"]) {
      await navigateConsoleTab(page, tab);
      await expect(page.getByTestId("btn-page-save")).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }
  });

  test("F9-T2-05 reload from disk restores saved hostname after dirty edit", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    const input = page.locator(".form-row", { hasText: "服务器名" }).locator("input").first();
    const original = await input.inputValue();

    await input.fill("Temporary Unsaved Name");
    await page.getByTestId("nav-connections").click();
    const dialog = page.getByRole("dialog", { name: "未保存的更改" });
    await dialog.getByRole("button", { name: "不保存" }).click();

    await connectConsole(page);
    await expect(page.getByTestId("dashboard-page")).toBeVisible({ timeout: 15000 });
    await navigateConsoleTab(page, "basic");
    await expect(page.locator(".form-row", { hasText: "服务器名" }).locator("input").first()).toHaveValue(original);
  });
});

test.describe("F10: Checkbox vs Switch Control Semantics (Tier 1)", () => {
  test("F10-T1-01 save-on-submit booleans in BasicSettings use Checkbox not Switch", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");

    const deferredLabels = [
      "x64",
      "Persistent",
      "AutoInit",
      "跳过大厅",
      "允许玩家在地图上绘图",
      "启用统计",
      "BattlEye",
      "禁用 VoN",
      "启用 HC",
    ];
    for (const label of deferredLabels) {
      const row = page.locator(".form-row", { hasText: label }).first();
      await expect(row).toBeVisible();
      await expect(row.locator('.el-checkbox, [role="checkbox"]').first()).toBeVisible();
      const checkbox = row.locator('input[type="checkbox"], [role="checkbox"]').first();
      await expect(checkbox).toHaveCount(1);
    }
    const pageSwitches = await page
      .locator('.shell-v2__page [role="switch"], .shell-v2__page .el-switch')
      .count();
    expect(pageSwitches).toBe(0);
  });

  test("F10-T1-02 save-on-submit booleans in advanced settings views use Checkbox semantics", async ({ page }) => {
    await connectMockedConsole(page, { showAdvancedSettings: true });
    for (const tab of ["network", "difficulty", "log"]) {
      await navigateConsoleTab(page, tab);
      await expect(page.getByTestId("btn-page-save")).toBeVisible();
      const viewSwitches = await page
        .locator('.shell-v2__page [role="switch"], .shell-v2__page .el-switch')
        .count();
      expect(viewSwitches).toBe(0);
      const viewCheckboxes = await page
        .locator(".shell-v2__page .el-checkbox, .shell-v2__page [role='checkbox']")
        .count();
      expect(viewCheckboxes).toBeGreaterThan(0);
    }
  });

  test("F10-T1-03 toggling a Checkbox in BasicSettings is deferred until explicit Save", async ({ page }) => {
    const mock = await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    const patchesBefore = mock.getRequests("PATCH", "/config").length;

    const battleyeRow = page.locator(".form-row", { hasText: "BattlEye" }).first();
    await battleyeRow.locator('.el-checkbox, [role="checkbox"]').first().click();

    await expect(page.getByTestId("sync-banner")).toBeVisible();
    expect(mock.getRequests("PATCH", "/config").length).toBe(patchesBefore);

    await page.getByTestId("btn-page-save").click();
    await expect
      .poll(() => mock.getRequests("PATCH", "/config").length)
      .toBeGreaterThan(patchesBefore);
  });

  test("F10-T1-04 immediate-effect toggles on LogsView and ModsView act immediately without Save", async ({ page }) => {
    const mock = await connectMockedConsole(page);

    await navigateConsoleTab(page, "logs");
    const logsBefore = mock.getRequests("GET", "/logs").length;
    await page.getByText("RPT", { exact: true }).first().click();
    await expect
      .poll(() => mock.getRequests("GET", "/logs").filter((r) => r.query.includes("kind=rpt")).length)
      .toBeGreaterThan(0);
    expect(mock.getRequests("GET", "/logs").length).toBeGreaterThan(logsBefore);

    const autoRefreshCb = page.locator(".shell-v2__page .el-checkbox", { hasText: "自动刷新" }).first();
    await expect(autoRefreshCb).toBeVisible();
    await autoRefreshCb.click();
    await expect(autoRefreshCb.locator('input[type="checkbox"]')).toBeChecked();
    await expect(page.getByTestId("sync-banner")).not.toBeVisible();

    await navigateConsoleTab(page, "mods");
    const patchesBefore = mock.getRequests("PATCH", "/config").length;

    const roleTrigger = page
      .locator('[data-testid^="mod-role-"], .el-switch')
      .first();
    await expect(roleTrigger).toBeVisible();
    await roleTrigger.click();

    await expect
      .poll(() => mock.getRequests("PATCH", "/config").length)
      .toBeGreaterThan(patchesBefore);
  });

  test("F10-T1-05 StatisticsView monitoring settings registers dirty state on checkbox toggle", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page, { showAdvancedSettings: true });
    await navigateConsoleTab(page, "statistics");

    await page.getByRole("tab", { name: "监控设置" }).click();
    const monitorRow = page.locator(".shell-v2__page .form-row", { hasText: "启用监控" }).first();
    const enableControl = monitorRow.locator(".el-checkbox").first();
    await expect(enableControl).toBeVisible();
    await expect(monitorRow.locator('input[type="checkbox"]').first()).toBeAttached();
    expect(await monitorRow.locator('.el-switch, [role="switch"]').count()).toBe(0);
    await enableControl.click();

    await page.getByTestId("nav-connections").click();
    const dialog = page.getByRole("dialog", { name: "未保存的更改" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "不保存" }).click();
    guards.assertClean();
  });
});

test.describe("F10: Checkbox vs Switch Control Semantics (Tier 2)", () => {
  test("F10-T2-01 keyboard Space toggles deferred Checkbox and activates dirty state", async ({ page }) => {
    const mock = await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    const patchesBefore = mock.getRequests("PATCH", "/config").length;

    const cb = page.locator(".form-row", { hasText: "BattlEye" }).locator('input[type="checkbox"]').first();
    const initialChecked = await cb.isChecked();
    await cb.focus();
    await page.keyboard.press("Space");

    expect(await cb.isChecked()).toBe(!initialChecked);
    await expect(page.getByTestId("sync-banner")).toBeVisible();
    expect(mock.getRequests("PATCH", "/config").length).toBe(patchesBefore);
  });

  test("F10-T2-02 clicking Checkbox label/subtext toggles underlying input cleanly", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");

    const row = page.locator(".form-row", { hasText: "Persistent" }).first();
    const cb = row.locator('input[type="checkbox"]').first();
    const before = await cb.isChecked();
    await row.locator(".el-checkbox, label").last().click();
    expect(await cb.isChecked()).toBe(!before);
  });

  test("F10-T2-03 immediate role toggle API failure reverts UI state and does not corrupt view", async ({ page }) => {
    const guards = attachErrorGuards(page, { ignoreNetworkHttpErrors: true });
    const mock = await connectMockedConsole(page, {
      patchConfigErrorStatus: 500,
      patchConfigErrorMessage: "Role Update Failed",
    });
    await navigateConsoleTab(page, "mods");

    const roleControl = page.locator('[data-testid^="mod-role-"], .el-switch').first();
    await expect(roleControl).toBeVisible();

    const readControlState = () =>
      roleControl.evaluate((el) => {
        const input = el.querySelector('input[type="checkbox"], [role="switch"]') as HTMLInputElement | null;
        return {
          isChecked: el.classList.contains("is-checked"),
          isActive: el.classList.contains("is-active"),
          ariaPressed: el.getAttribute("aria-pressed"),
          ariaChecked: el.getAttribute("aria-checked") ?? input?.getAttribute("aria-checked") ?? null,
          inputChecked: input ? input.checked : null,
        };
      });

    const initialState = await readControlState();
    const hasSemanticState =
      initialState.ariaPressed !== null ||
      initialState.ariaChecked !== null ||
      initialState.inputChecked !== null;
    expect(hasSemanticState).toBe(true);

    await roleControl.click();
    await expect
      .poll(() => mock.getRequests("PATCH", "/config").length)
      .toBeGreaterThan(0);
    await expect(page.locator(".el-message--error, [role='alert']").first()).toBeVisible();
    await expect.poll(readControlState).toEqual(initialState);
    await expect(page.getByTestId("console-shell")).toBeVisible();
    expect(guards.pageErrors).toEqual([]);
  });

  test("F10-T2-04 MissionsView options and FirstServerWizard step checkboxes work cleanly", async ({ page }) => {
    await connectMockedConsole(page, { showAdvancedSettings: true });
    await navigateConsoleTab(page, "missions");
    const missionCbs = page.locator('.shell-v2__page .el-checkbox');
    expect(await missionCbs.count()).toBeGreaterThan(0);

    await page.getByTestId("server-panel").locator("button").first().click();
    await page.getByTestId("btn-first-server-wizard").click();
    // 步骤 0→4：SteamCMD 选项在最后一步
    for (let i = 0; i < 4; i++) {
      await page.getByTestId("wizard-next").click();
    }
    // Element Plus 的 .el-checkbox 本身是 <label>，原生 input 视觉隐藏；
    // 用可见文案定位外壳，点外壳并断言内部 input 的勾选状态。
    const dedicatedLabel = page.locator(".el-checkbox", { hasText: "完成后安装/更新专用服务器" });
    await expect(dedicatedLabel).toBeVisible();
    const dedicatedInput = dedicatedLabel.locator('input[type="checkbox"]');
    if (await dedicatedInput.isChecked()) {
      await dedicatedLabel.click();
      await expect(dedicatedInput).not.toBeChecked();
    }
    await dedicatedLabel.click();
    await expect(dedicatedInput).toBeChecked();
    await dedicatedLabel.click();
    await expect(dedicatedInput).not.toBeChecked();
    await page.getByTestId("first-server-wizard").getByRole("button", { name: "取消" }).click();
  });

  test("F10-T2-05 Global Settings popover controls save cleanly via 保存 button", async ({ page }) => {
    const mock = await connectMockedConsole(page);
    await page.getByRole("button", { name: "全局设置" }).click();
    const popover = page.locator(".el-popover .global-settings, .global-settings").first();
    await expect(popover).toBeVisible();
    const firstCheckbox = popover.locator(".el-checkbox").first();
    await expect(firstCheckbox).toBeVisible();
    await expect(popover.locator('input[type="checkbox"]').first()).toBeAttached();
    expect(await popover.locator('.el-switch, [role="switch"]').count()).toBe(0);
    await firstCheckbox.click();
    await popover.getByRole("button", { name: "保存" }).click();

    await expect
      .poll(() => mock.getRequests("PUT", "/api/v1/settings/ui").length)
      .toBeGreaterThan(0);
  });
});
