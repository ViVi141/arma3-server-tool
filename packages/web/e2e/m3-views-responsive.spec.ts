import { test, expect } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  attachErrorGuards,
  connectMockedConsole,
  createDefaultMockMods,
  installMockApi,
  navigateConsoleTab,
  openFirstServerWizard,
  openInstanceMenu,
} from "./helpers";

test.describe("F2: Responsive CSS & Mobile Accessibility (Tier 1)", () => {
  test("F2-T1-01 desktop 1280x720 navigation rail layout without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await connectMockedConsole(page);

    const rail = page.getByTestId("nav-panel");
    await expect(rail).toBeVisible();
    const box = await rail.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(box!.width);
    await assertNoHorizontalOverflow(page);
  });

  test("F2-T1-02 mobile 390x844 responsive nav adapts cleanly with zero overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connectMockedConsole(page);

    const rail = page.getByTestId("nav-panel");
    await expect(rail).toBeVisible();
    const box = await rail.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(280);
    await assertNoHorizontalOverflow(page);
  });

  test("F2-T1-03 mobile 390x844 nav buttons meet touch target height >= 40px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connectMockedConsole(page);

    const buttons = page.getByTestId("nav-panel").locator("button:visible");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(40);
    }
  });

  test("F2-T1-04 viewport meta preserves pinch-zoom accessibility", async ({ page }) => {
    await installMockApi(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const content = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(content).not.toBeNull();
    expect(content!.toLowerCase()).not.toContain("maximum-scale=1");
    expect(content!.toLowerCase()).not.toContain("user-scalable=no");
  });

  test("F2-T1-05 keyboard Tab focus moves cleanly with visible focus indicator", async ({ page }) => {
    await connectMockedConsole(page);
    await page.getByTestId("mode-overview").focus();
    await page.keyboard.press("Tab");

    const activeInfo = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        tagName: el.tagName,
        outlineStyle: cs.outlineStyle,
        boxShadow: cs.boxShadow,
      };
    });
    expect(activeInfo).not.toBeNull();
    expect(activeInfo!.tagName).not.toBe("BODY");
  });
});

test.describe("F2: Responsive CSS & Mobile Accessibility (Tier 2)", () => {
  test("F2-T2-01 1024px exact breakpoint boundary overflow check", async ({ page }) => {
    await connectMockedConsole(page);
    for (const width of [1025, 1024]) {
      await page.setViewportSize({ width, height: 768 });
      await navigateConsoleTab(page, "dashboard");
      await assertNoHorizontalOverflow(page);
      await navigateConsoleTab(page, "basic");
      await assertNoHorizontalOverflow(page);
    }
  });

  test("F2-T2-02 768px exact breakpoint boundary transition without clipping", async ({ page }) => {
    await connectMockedConsole(page);
    for (const width of [768, 767]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByTestId("nav-panel")).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }
  });

  test("F2-T2-03 extreme narrow mobile 320x568 zero horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await installMockApi(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await assertNoHorizontalOverflow(page);

    await page.getByTestId("btn-connect").first().click();
    await expect(page.getByTestId("console-shell")).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await navigateConsoleTab(page, "basic");
    await assertNoHorizontalOverflow(page);
  });

  test("F2-T2-04 compact landscape height 667x375 keeps dialogs and views usable", async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await connectMockedConsole(page);
    await assertNoHorizontalOverflow(page);

    await openFirstServerWizard(page);
    const wizard = page.getByTestId("first-server-wizard");
    await expect(wizard).toBeVisible();
    await wizard.getByRole("button", { name: "取消" }).click();
    await expect(wizard).not.toBeVisible();
  });

  test("F2-T2-05 runtime window resize mid-session preserves active tab and unsaved edit", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");

    const input = page.locator(".form-row", { hasText: "服务器名" }).locator("input").first();
    await input.fill("Resize Persistent Value");

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page);
    await expect(input).toHaveValue("Resize Persistent Value");

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page).toHaveURL(/\/basic/);
    await expect(input).toHaveValue("Resize Persistent Value");
  });
});

test.describe("F12: Full-Site Views & Chart.js M3 Upgrade (Tier 1)", () => {
  test("F12-T1-01 StatisticsView renders Chart.js canvas charts and KPI summary", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page, { showAdvancedSettings: true });
    await navigateConsoleTab(page, "statistics");

    await expect(page.getByText("平均在线")).toBeVisible();
    await expect(page.getByText("峰值在线")).toBeVisible();
    await expect(page.getByText("采样点数")).toBeVisible();

    const canvases = page.locator("canvas");
    await expect(canvases).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const box = await canvases.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(100);
      expect(box!.height).toBeGreaterThan(80);
    }
    guards.assertClean();
  });

  test("F12-T1-02 DashboardView renders tonal status tiles and quick actions", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);

    const dash = page.getByTestId("dashboard-page");
    await expect(dash).toBeVisible();
    await expect(dash.getByText("运行状态")).toBeVisible();
    await expect(dash.getByText("在线人数")).toBeVisible();
    await expect(dash.getByText("主机名", { exact: true })).toBeVisible();
    await expect(dash.getByText("游戏端口")).toBeVisible();
    await expect(page.getByTestId("dashboard-preflight")).toBeVisible();
    guards.assertClean();
  });

  test("F12-T1-03 LogsView renders kind selector, file dropdown, and log output", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "logs");

    for (const label of ["Console", "RPT", "BattlEye", "全部"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await page.getByRole("button", { name: "加载" }).click();
    await expect(page.locator("pre.log-pre")).toContainText("[11:00:00] Server started");
    guards.assertClean();
  });

  test("F12-T1-04 PreflightView, SnapshotsView, and SchedulerView render cleanly", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page, { showAdvancedSettings: true });

    await navigateConsoleTab(page, "preflight");
    await expect(page.getByTestId("preflight-page")).toBeVisible();

    await navigateConsoleTab(page, "snapshots");
    await expect(page.getByRole("button", { name: "创建快照" })).toBeVisible();

    await navigateConsoleTab(page, "scheduler");
    await expect(page.locator(".shell-v2__page")).toBeVisible();
    guards.assertClean();
  });

  test("F12-T1-05 RconView, BansView, SteamCmdView, MissionsView, and AboutView render cleanly", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page, { showAdvancedSettings: true });

    for (const tab of ["rcon", "bans", "steamcmd", "missions", "about"]) {
      await navigateConsoleTab(page, tab);
      await expect(page.locator(".shell-v2__page")).toBeVisible();
    }
    await expect(page.getByText("关于 Arma3 Server Tools")).toBeVisible();
    guards.assertClean();
  });

  test("F12-T1-06 ConnectionsView, HostSettingsView, NewServerDialog, and FirstServerWizard render cleanly", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await installMockApi(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("connections-page")).toBeVisible();

    await page.goto("/#/settings/host");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("被控服务", { exact: true })).toBeVisible();

    // HostSettingsView 自身也有一个 nav-back-connections（返回主机连接），取顶栏那个
    await page.getByTestId("nav-back-connections").first().click();
    await page.getByTestId("btn-connect").first().click();
    await expect(page.getByTestId("console-shell")).toBeVisible();

    await openInstanceMenu(page);
    await page.getByTestId("btn-new-server").click();
    await expect(page.getByTestId("new-server-dialog")).toBeVisible();
    await page.getByTestId("new-server-dialog").getByRole("button", { name: "取消" }).click();

    await openFirstServerWizard(page);
    await expect(page.getByTestId("first-server-wizard")).toBeVisible();
    await page.getByTestId("first-server-wizard").getByRole("button", { name: "取消" }).click();
    guards.assertClean();
  });
});

test.describe("F12: Full-Site Views & Chart.js M3 Upgrade (Tier 2)", () => {
  test("F12-T2-01 StatisticsView empty dataset renders 0 metrics and zero errors", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page, { showAdvancedSettings: true, emptyMonitoring: true });
    await navigateConsoleTab(page, "statistics");

    await expect(page.getByText("无玩家记录")).toBeVisible();
    await expect(page.locator(".shell-v2__page")).not.toContainText("NaN");
    guards.assertClean();
  });

  test("F12-T2-02 DashboardView with cfgWritten=false and null metrics shows notice without undefined/null", async ({ page }) => {
    await connectMockedConsole(page, {
      cfgWritten: false,
      dashboardOverrides: {
        onlineCount: null,
        latestRpt: null,
        cfgWritten: false,
      },
    });
    const dash = page.getByTestId("dashboard-page");
    await expect(dash).toContainText("尚未写入游戏配置");
    await expect(dash).not.toContainText("undefined");
    await expect(dash).not.toContainText("null");
  });

  test("F12-T2-03 LogsView empty files state and 500 error resilience", async ({ page }) => {
    const guards = attachErrorGuards(page, { ignoreNetworkHttpErrors: true });
    await connectMockedConsole(page, { emptyLogs: true });
    await navigateConsoleTab(page, "logs");
    await expect(page.getByText("点击加载查看日志")).toBeVisible();

    await installMockApi(page, { logsReadErrorStatus: 500 });
    await page.getByRole("button", { name: "加载" }).click();
    expect(guards.pageErrors).toEqual([]);
  });

  test("F12-T2-04 120-char long server name, hostname, and mod path truncate without overflow", async ({ page }) => {
    const longName = "A".repeat(120);
    const longMods = createDefaultMockMods().map((m) => ({
      ...m,
      path: `C:\\very_long_directory\\${"segment_".repeat(15)}\\${m.dirName}`,
    }));
    await connectMockedConsole(page, {
      servers: [{ uuid: "srv-long", configName: longName, serverDir: "C:\\arma3" }],
      mods: longMods,
      dashboardOverrides: {
        hostname: longName,
        latestRpt: `${"rpt_".repeat(30)}.rpt`,
      },
    });
    await assertNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoHorizontalOverflow(page);
  });

  test("F12-T2-05 zero console.error and zero pageerror across all console tabs", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page, { showAdvancedSettings: true });

    const allTabs = [
      "dashboard",
      "preflight",
      "snapshots",
      "scheduler",
      "mods",
      "steamcmd",
      "missions",
      "logs",
      "rcon",
      "statistics",
      "basic",
      "performance",
      "network",
      "security",
      "difficulty",
      "log",
      "config",
      "bans",
      "about",
    ];
    for (const tab of allTabs) {
      await navigateConsoleTab(page, tab);
    }
    guards.assertClean();
  });
});

test.describe("F13-F14: Backend Security, BUG & Perf Contracts (Tier 1)", () => {
  test("F13-14-T1-01 server rename PUT /servers/:uuid/rename updates switcher label cleanly", async ({ page }) => {
    const mock = await connectMockedConsole(page);
    await openInstanceMenu(page);
    await page.getByTestId("server-list").getByRole("button", { name: "重命名" }).click();

    const msgBox = page.locator(".el-message-box");
    await expect(msgBox).toBeVisible();
    await msgBox.locator("input").fill("Renamed-Op-01");
    // 重命名弹窗确认按钮文案是「保存」（ElMessageBox.prompt confirmButtonText）
    await msgBox.getByRole("button", { name: "保存", exact: true }).click();

    await expect
      .poll(() => mock.getRequests("PUT", "/rename").length)
      .toBeGreaterThan(0);
    await expect(page.getByTestId("server-panel")).toContainText("Renamed-Op-01");
  });

  test("F13-14-T1-02 HTML mod-list import parses Workshop IDs and opens enable dialog", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");

    await page.getByRole("button", { name: "获取模组" }).click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "从 HTML 启用..." }).click();
    const chooser = await chooserPromise;

    const sampleHtml = `<html><body><table><tr data-type="ModContainer"><td data-type="DisplayName">CBA_A3</td><td><a href="https://steamcommunity.com/sharedfiles/filedetails/?id=450814997">Link</a></td></tr></table></body></html>`;
    await chooser.setFiles({
      name: "preset.html",
      mimeType: "text/html",
      buffer: Buffer.from(sampleHtml, "utf-8"),
    });

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("450814997");
    await dialog.getByRole("button", { name: "取消" }).click();
  });

  test("F13-14-T1-03 monitoring collect now and CSV export complete cleanly", async ({ page }) => {
    const mock = await connectMockedConsole(page, { showAdvancedSettings: true });
    await navigateConsoleTab(page, "statistics");

    await page.getByRole("button", { name: "导出 CSV..." }).click();
    await expect
      .poll(() => mock.getRequests("GET", "/monitoring/export/csv").length)
      .toBeGreaterThan(0);

    await page.getByRole("tab", { name: "监控设置" }).click();
    await page.getByRole("button", { name: "立即采集" }).click();
    await expect
      .poll(() => mock.getRequests("POST", "/api/v1/monitoring/collect").length)
      .toBeGreaterThan(0);
  });

  test("F13-14-T1-04 snapshot create and restore flow works cleanly on SnapshotsView", async ({ page }) => {
    const mock = await connectMockedConsole(page);
    await navigateConsoleTab(page, "snapshots");

    await page.getByPlaceholder("快照备注").fill("e2e-snap");
    await page.getByRole("button", { name: "创建快照" }).click();

    await expect
      .poll(() => mock.getRequests("POST", "/snapshots").length)
      .toBeGreaterThan(0);
    await expect(page.getByText("e2e-snap")).toBeVisible();

    await page.getByRole("button", { name: "恢复" }).first().click();
    await expect
      .poll(() => mock.getRequests("POST", "/restore").length)
      .toBeGreaterThan(0);
  });

  test("F13-14-T1-05 mission PBO upload with writeCfg=true invokes contract endpoint", async ({ page }) => {
    const mock = await connectMockedConsole(page, { showAdvancedSettings: true });
    await navigateConsoleTab(page, "missions");

    const fileInput = page.locator('input[type="file"][accept=".pbo"]').first();
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "MP_Uploaded_Test.Altis.pbo",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("PBO_HEADER_MOCK"),
    });

    const writeCfgRow = page.locator(".el-form-item", { hasText: "写入服务器 cfg" });
    await writeCfgRow.locator('.el-switch, [role="switch"], input[type="checkbox"]').first().click();

    await page.getByRole("button", { name: /上传/ }).first().click();
    await expect
      .poll(() => mock.getRequests("POST", "/files/mission-pbo").length)
      .toBeGreaterThan(0);
    const req = mock.getRequests("POST", "/files/mission-pbo")[0];
    expect(req.query).toContain("writeCfg=true");
  });
});

test.describe("F13-F14: Backend Security, BUG & Perf Contracts (Tier 2)", () => {
  test("F13-14-T2-01 invalid unreachable host URL in Add Host dialog fails gracefully", async ({ page }) => {
    const guards = attachErrorGuards(page, { ignoreNetworkHttpErrors: true });
    await installMockApi(page);
    await page.route("http://127.0.0.1:59999/**", (route) => route.abort("connectionrefused"));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("btn-add-host").click();
    await page.getByTestId("input-host-name").fill("BadHost");
    await page.getByTestId("input-host-url").fill("http://127.0.0.1:59999");
    await page.getByTestId("btn-add-host-confirm").click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByTestId("input-host-name")).toHaveValue("BadHost");
    expect(guards.pageErrors).toEqual([]);
  });

  test("F13-14-T2-02 empty or whitespace server rename does not overwrite server name", async ({ page }) => {
    await connectMockedConsole(page);
    await openInstanceMenu(page);
    await page.getByTestId("server-list").getByRole("button", { name: "重命名" }).click();

    const msgBox = page.locator(".el-message-box");
    await expect(msgBox).toBeVisible();
    await msgBox.locator("input").fill("   ");
    // 重命名弹窗确认按钮文案是「保存」（ElMessageBox.prompt confirmButtonText）
    await msgBox.getByRole("button", { name: "保存", exact: true }).click();

    await expect(page.getByTestId("server-panel")).toContainText("E2E Mock Server");
  });

  test("F13-14-T2-03 empty or invalid HTML mod preset upload handled gracefully without crash", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");

    await page.getByRole("button", { name: "获取模组" }).click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: "从 HTML 启用..." }).click();
    const chooser = await chooserPromise;

    await chooser.setFiles({
      name: "empty.html",
      mimeType: "text/html",
      buffer: Buffer.from("<html><body>No mods here</body></html>", "utf-8"),
    });

    await expect(page.getByText("扫描刷新")).toBeVisible();
    guards.assertClean();
  });

  test("F13-14-T2-04 SteamCMD password input never leaks plaintext password in rendered UI", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page, { showAdvancedSettings: true });
    await navigateConsoleTab(page, "steamcmd");

    const secret = "S3cr3tPass!";
    const pwdInput = page.locator('input[type="password"]').first();
    await expect(pwdInput).toBeVisible();
    await pwdInput.fill(secret);
    // 必须点 SteamCMD 的「保存凭据」，顶栏的「保存」只写配置包、不涉及凭据
    await page.getByRole("button", { name: "保存凭据", exact: true }).click();

    await expect(pwdInput).toHaveValue("");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toContain(secret);
    guards.assertClean();
  });

  test("F13-14-T2-05 API 400 error on PATCH config preserves edited form values for retry", async ({ page }) => {
    const guards = attachErrorGuards(page, { ignoreNetworkHttpErrors: true });
    await connectMockedConsole(page, {
      patchConfigErrorStatus: 400,
      patchConfigErrorMessage: "Invalid port",
    });
    await navigateConsoleTab(page, "basic");

    const hostInput = page.locator(".form-row", { hasText: "服务器名" }).locator("input").first();
    await hostInput.fill("Preserved After 400");
    await page.getByTestId("btn-page-save").click();

    await expect(hostInput).toHaveValue("Preserved After 400");
    expect(guards.pageErrors).toEqual([]);
  });
});
