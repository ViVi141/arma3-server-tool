import { test, expect } from "@playwright/test";
import {
  assertNoHorizontalOverflow,
  attachErrorGuards,
  connectConsole,
  connectMockedConsole,
  getContrastRatio,
  getRelativeLuminance,
  installMockApi,
  navigateConsoleTab,
  openCommandPalette,
  openInstanceMenu,
  setThemeMode,
} from "./helpers";

test.describe("F1: M3 Color, Surface, Typography & Elevation (Tier 1)", () => {
  test("F1-T1-01 light mode M3 system color tokens and surface luminance", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await installMockApi(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await setThemeMode(page, "light");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      return {
        primary: root.getPropertyValue("--md-sys-color-primary").trim(),
        surface: root.getPropertyValue("--md-sys-color-surface").trim(),
        onSurface: root.getPropertyValue("--md-sys-color-on-surface").trim(),
        bodyBg: body.backgroundColor,
        bodyColor: body.color,
      };
    });

    expect(tokens.primary.length).toBeGreaterThan(0);
    expect(tokens.surface.length).toBeGreaterThan(0);
    expect(tokens.onSurface.length).toBeGreaterThan(0);
    expect(getRelativeLuminance(tokens.bodyBg)).toBeGreaterThan(0.8);
    expect(getRelativeLuminance(tokens.bodyColor)).toBeLessThan(0.25);
    guards.assertClean();
  });

  test("F1-T1-02 dark mode M3 system color tokens and non-VSCode surfaces", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);
    await setThemeMode(page, "dark");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const darkStyles = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const shell = document.querySelector('[data-testid="console-shell"]');
      const shellStyle = shell ? getComputedStyle(shell) : body;
      return {
        bodyBg: body.backgroundColor,
        shellBg: shellStyle.backgroundColor,
        bodyColor: body.color,
      };
    });

    expect(getRelativeLuminance(darkStyles.bodyBg)).toBeLessThan(0.15);
    expect(darkStyles.bodyBg).not.toBe("rgb(30, 30, 30)");
    expect(darkStyles.bodyBg).not.toBe("rgb(37, 37, 38)");
    expect(darkStyles.shellBg).not.toBe("rgb(30, 30, 30)");
    expect(getRelativeLuminance(darkStyles.bodyColor)).toBeGreaterThan(0.5);
    guards.assertClean();
  });

  test("F1-T1-03 Element Plus dialogs inherit M3 dark tokens without #2d2d2d leak", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await installMockApi(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await setThemeMode(page, "dark");

    await page.getByTestId("btn-add-host").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const dialogBg = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(dialogBg).not.toBe("rgb(45, 45, 45)");
    expect(dialogBg).not.toBe("rgb(37, 37, 38)");
    expect(getRelativeLuminance(dialogBg)).toBeLessThan(0.2);

    await dialog.getByRole("button", { name: "取消" }).click();
    guards.assertClean();
  });

  test("F1-T1-04 zero translucent liquid-glass backdrop blur on routine surfaces", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);

    const blurs = await page.evaluate(() => {
      const selectors = [
        '[data-testid="console-shell"]',
        '[data-testid="nav-panel"]',
        '[data-testid="dashboard-page"]',
      ];
      return selectors.map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { sel, blur: "missing" };
        const cs = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
        return {
          sel,
          blur: cs.backdropFilter || cs.webkitBackdropFilter || "none",
        };
      });
    });

    for (const item of blurs) {
      expect(item.blur === "none" || item.blur === "").toBe(true);
    }
    guards.assertClean();
  });

  test("F1-T1-05 M3 typography scale and outline restraint on console views", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    await expect(page.getByTestId("btn-page-save")).toBeVisible();

    const typo = await page.evaluate(() => {
      const heading = document.querySelector("h1, h2, h3");
      const bodySize = parseFloat(getComputedStyle(document.body).fontSize);
      const headingSize = heading ? parseFloat(getComputedStyle(heading).fontSize) : bodySize;
      return { bodySize, headingSize };
    });

    expect(typo.bodySize).toBeGreaterThanOrEqual(12);
    expect(typo.headingSize).toBeGreaterThanOrEqual(16);
    guards.assertClean();
  });
});

test.describe("F1: M3 Color, Surface, Typography & Elevation (Tier 2)", () => {
  test("F1-T2-01 WCAG contrast ratio >= 4.5:1 on primary text in light and dark modes", async ({ page }) => {
    await connectMockedConsole(page);
    for (const mode of ["light", "dark"] as const) {
      await setThemeMode(page, mode);
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
      const colors = await page.evaluate(() => {
        const body = getComputedStyle(document.body);
        return { fg: body.color, bg: body.backgroundColor };
      });
      const ratio = getContrastRatio(colors.fg, colors.bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("F1-T2-02 rapid repeated theme switching causes no stale surface tokens", async ({ page }) => {
    await connectMockedConsole(page);
    for (let i = 0; i < 2; i++) {
      await setThemeMode(page, "light");
      await setThemeMode(page, "dark");
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const bgLum = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    expect(getRelativeLuminance(bgLum)).toBeLessThan(0.15);

    await setThemeMode(page, "light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const lightBg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor
    );
    expect(getRelativeLuminance(lightBg)).toBeGreaterThan(0.8);
  });

  test("F1-T2-03 prefers-reduced-motion disables or minimizes transition durations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await connectMockedConsole(page);
    await openCommandPalette(page, "shortcut");

    const duration = await page.getByTestId("command-palette").evaluate((el) => {
      return parseFloat(getComputedStyle(el).transitionDuration || "0");
    });
    expect(duration).toBeLessThanOrEqual(0.05);
  });

  test("F1-T2-04 200% zoom equivalent narrow desktop 640x360 reflows without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await connectMockedConsole(page);
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test("F1-T2-05 status chips and sync banner convey state with text labels not color alone", async ({ page }) => {
    await connectMockedConsole(page, { cfgStale: true });
    const banner = page.getByTestId("sync-banner");
    await expect(banner).toBeVisible();
    const bannerText = (await banner.innerText()).trim();
    expect(bannerText.length).toBeGreaterThan(4);

    await navigateConsoleTab(page, "mods");
    await expect(page.getByText("有更新").first()).toBeVisible();
    // 签名状态文案已细化为逐 PBO 文件证据：unsigned 显示「未发现签名」。
    await expect(page.getByText("未发现签名").first()).toBeVisible();
  });
});

test.describe("F3: Offline Material Vector Icons (Tier 1)", () => {
  test("F3-T1-01 navigation rail modes render offline inline SVG icons", async ({ page }) => {
    await connectMockedConsole(page);
    const modes = ["overview", "deploy", "workshop", "logs", "config", "system"];
    for (const mode of modes) {
      const btn = page.getByTestId(`mode-${mode}`);
      await expect(btn).toBeVisible();
      const svg = btn.locator("svg").first();
      await expect(svg).toBeVisible();
      const box = await svg.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(16);
      expect(box!.height).toBeGreaterThanOrEqual(16);
      expect(await svg.locator("path").count()).toBeGreaterThan(0);
    }
  });

  test("F3-T1-02 rail mode buttons show localized labels cleanly", async ({ page }) => {
    await connectMockedConsole(page);
    const expected: Record<string, string> = {
      overview: "概览",
      deploy: "部署",
      workshop: "工坊",
      logs: "运维",
      config: "配置",
      system: "系统",
    };
    for (const [id, label] of Object.entries(expected)) {
      await expect(page.getByTestId(`mode-${id}`)).toContainText(label);
    }
  });

  test("F3-T1-03 theme switcher icon button renders SVG icon with accessible name", async ({ page }) => {
    await connectMockedConsole(page);
    const toggle = page.getByTestId("theme-mode-select");
    await expect(toggle).toBeVisible();
    const svg = toggle.locator("svg").first();
    await expect(svg).toBeVisible();
    const box = await svg.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(16);
    expect(box!.height).toBeGreaterThanOrEqual(16);

    const accName = await toggle.evaluate(
      (el) => el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || ""
    );
    expect(accName.trim().length).toBeGreaterThan(0);
  });

  test("F3-T1-04 zero external CDN icon or font requests across routes", async ({ page }) => {
    const externalRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (
        url.includes("fonts.googleapis.com") ||
        url.includes("fonts.gstatic.com") ||
        url.includes("cdn.jsdelivr.net") ||
        url.includes("unpkg.com")
      ) {
        externalRequests.push(url);
      }
    });

    await connectMockedConsole(page);
    await navigateConsoleTab(page, "mods");
    await navigateConsoleTab(page, "basic");
    await navigateConsoleTab(page, "logs");

    expect(externalRequests).toEqual([]);
  });

  test("F3-T1-05 action bar and command trigger render zero broken images and valid SVGs", async ({ page }) => {
    await connectMockedConsole(page);
    const brokenImages = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("img"))
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.src);
    });
    expect(brokenImages).toEqual([]);

    const cmdBtn = page.getByTestId("btn-command-palette");
    if (await cmdBtn.isVisible().catch(() => false)) {
      await expect(cmdBtn.locator("svg").first()).toBeVisible();
    }
  });
});

test.describe("F3: Offline Material Vector Icons (Tier 2)", () => {
  test("F3-T2-01 disabled nav mode buttons retain rendered icon and visible opacity", async ({ page }) => {
    await installMockApi(page, { servers: [] });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await connectConsole(page);
    await expect(page.getByTestId("content-empty-state")).toBeVisible();

    const configMode = page.getByTestId("mode-config");
    await expect(configMode).toBeDisabled();
    const svg = configMode.locator("svg").first();
    await expect(svg).toBeVisible();
    const opacity = await configMode.evaluate((el) => parseFloat(getComputedStyle(el).opacity || "1"));
    expect(opacity).toBeGreaterThan(0.1);
  });

  test("F3-T2-02 decorative icons inside labeled nav buttons carry aria-hidden=true", async ({ page }) => {
    await connectMockedConsole(page);
    const svgHidden = await page
      .getByTestId("mode-overview")
      .locator("svg")
      .first()
      .getAttribute("aria-hidden");
    expect(svgHidden).toBe("true");
  });

  test("F3-T2-03 icon-only theme button exposes non-empty aria-label or title", async ({ page }) => {
    await connectMockedConsole(page);
    const toggle = page.getByTestId("theme-mode-select");
    const label = await toggle.evaluate(
      (el) => (el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "").trim()
    );
    expect(label.length).toBeGreaterThan(0);
  });

  test("F3-T2-04 SVG icons maintain 1:1 aspect ratio without clipping on 390x844 mobile nav", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await connectMockedConsole(page);
    const boxes = await page.getByTestId("nav-panel").locator("svg").evaluateAll((svgs) =>
      svgs.map((svg) => {
        const r = svg.getBoundingClientRect();
        return { width: r.width, height: r.height };
      })
    );
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.width).toBeGreaterThanOrEqual(16);
      expect(b.height).toBeGreaterThanOrEqual(16);
      expect(Math.abs(b.width - b.height)).toBeLessThanOrEqual(2);
    }
  });

  test("F3-T2-05 nav SVG icons retain readable light color luminance in dark mode", async ({ page }) => {
    await connectMockedConsole(page);
    await setThemeMode(page, "dark");
    const svgColor = await page
      .getByTestId("mode-overview")
      .locator("svg")
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(getRelativeLuminance(svgColor)).toBeGreaterThan(0.35);
  });
});

test.describe("F4: M3 Theme Icon Button (Tier 1)", () => {
  test("F4-T1-01 theme control is semantic button not select on connections and console", async ({ page }) => {
    await installMockApi(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const connToggle = page.getByTestId("theme-mode-select");
    await expect(connToggle).toHaveJSProperty("tagName", "BUTTON");

    await connectConsole(page);
    const shellToggle = page.getByTestId("theme-mode-select");
    await expect(shellToggle).toHaveJSProperty("tagName", "BUTTON");
  });

  test("F4-T1-02 selecting light mode updates html[data-theme] and localStorage", async ({ page }) => {
    await connectMockedConsole(page);
    await setThemeMode(page, "light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("a3st-theme-mode")))
      .toBe("light");
  });

  test("F4-T1-03 selecting dark mode updates html[data-theme] and localStorage", async ({ page }) => {
    await connectMockedConsole(page);
    await setThemeMode(page, "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("a3st-theme-mode")))
      .toBe("dark");
  });

  test("F4-T1-04 system mode follows OS prefers-color-scheme dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await connectMockedConsole(page);
    await setThemeMode(page, "light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await setThemeMode(page, "system");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("a3st-theme-mode")))
      .toBe("system");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("F4-T1-05 theme toggle works identically on connections bar", async ({ page }) => {
    await installMockApi(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await setThemeMode(page, "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await setThemeMode(page, "light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test.describe("F4: M3 Theme Icon Button (Tier 2)", () => {
  test("F4-T2-01 dark theme persists across full page reload", async ({ page }) => {
    await connectMockedConsole(page);
    await setThemeMode(page, "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("F4-T2-02 explicit light theme overrides OS dark mode across reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await connectMockedConsole(page);
    await setThemeMode(page, "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("F4-T2-03 corrupted localStorage a3st-theme-mode falls back safely", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await installMockApi(page);
    await page.addInitScript(() => {
      localStorage.setItem("a3st-theme-mode", "corrupted-xyz-999");
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const theme = await page.locator("html").getAttribute("data-theme");
    expect(theme === "light" || theme === "dark").toBe(true);
    guards.assertClean();
  });

  test("F4-T2-04 theme toggle is operable via keyboard Enter and Space", async ({ page }) => {
    await connectMockedConsole(page);
    const toggle = page.getByTestId("theme-mode-select");
    await toggle.focus();
    const beforeEnter = await toggle.getAttribute("data-theme-mode");
    expect(beforeEnter).not.toBeNull();
    await page.keyboard.press("Enter");

    const optionDark = page.getByTestId("theme-option-dark");
    if (await optionDark.isVisible().catch(() => false)) {
      await optionDark.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    } else {
      await expect
        .poll(() => toggle.getAttribute("data-theme-mode"))
        .not.toBe(beforeEnter);
    }

    await toggle.focus();
    const beforeSpace = await toggle.getAttribute("data-theme-mode");
    expect(beforeSpace).not.toBeNull();
    await page.keyboard.press("Space");

    const optionLight = page.getByTestId("theme-option-light");
    if (await optionLight.isVisible().catch(() => false)) {
      await optionLight.click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    } else {
      await expect
        .poll(() => toggle.getAttribute("data-theme-mode"))
        .not.toBe(beforeSpace);
    }
  });

  test("F4-T2-05 six consecutive clicks wrap cleanly across two full cycles", async ({ page }) => {
    await connectMockedConsole(page);
    const toggle = page.getByTestId("theme-mode-select");
    const initialMode = await toggle.getAttribute("data-theme-mode");
    expect(initialMode).toBeTruthy();

    const seenModes: string[] = [];
    for (let i = 0; i < 6; i++) {
      const prevMode = await toggle.getAttribute("data-theme-mode");
      await toggle.click();
      const optionVisible = await page
        .locator('[data-testid^="theme-option-"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (optionVisible) {
        await page.keyboard.press("Escape");
        break;
      }
      await expect
        .poll(() => toggle.getAttribute("data-theme-mode"))
        .not.toBe(prevMode);
      const nextMode = await toggle.getAttribute("data-theme-mode");
      expect(nextMode).toBeTruthy();
      seenModes.push(nextMode!);
    }

    if (seenModes.length === 6) {
      expect(new Set(seenModes).size).toBe(3);
      expect(seenModes[2]).toBe(initialMode);
      expect(seenModes[5]).toBe(initialMode);
    }
    const finalMode = await toggle.getAttribute("data-theme-mode");
    expect(finalMode).toBe(initialMode);
  });
});

test.describe("F5: Ctrl+K Command & Config Search (Tier 1)", () => {
  test("F5-T1-01 Ctrl+K keyboard shortcut opens command palette with focused input", async ({ page }) => {
    await connectMockedConsole(page);
    await openCommandPalette(page, "shortcut");
    await expect(page.getByTestId("command-palette-input")).toBeFocused();
  });

  test("F5-T1-02 topbar search trigger button opens command palette", async ({ page }) => {
    await connectMockedConsole(page);
    await openCommandPalette(page, "button");
    await expect(page.getByTestId("command-palette")).toBeVisible();
  });

  test("F5-T1-03 filtering and navigating to mods tab via command palette", async ({ page }) => {
    await connectMockedConsole(page);
    await openCommandPalette(page, "shortcut");
    await page.getByTestId("command-palette-input").fill("模组");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("command-palette")).not.toBeVisible();
    await expect(page).toHaveURL(/\/mods/);
    await expect(page.getByText("扫描刷新")).toBeVisible();
  });

  test("F5-T1-04 filtering and jumping to basic settings via command palette", async ({ page }) => {
    await connectMockedConsole(page);
    await openCommandPalette(page, "shortcut");
    await page.getByTestId("command-palette-input").fill("基本");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("command-palette")).not.toBeVisible();
    await expect(page).toHaveURL(/\/basic/);
    await expect(page.getByTestId("btn-page-save")).toBeVisible();
  });

  test("F5-T1-05 triggering preflight action or navigation via command palette", async ({ page }) => {
    await connectMockedConsole(page);
    await openCommandPalette(page, "shortcut");
    await page.getByTestId("command-palette-input").fill("开服检查");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("command-palette")).not.toBeVisible();
    await expect(page.getByTestId("preflight-page")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("F5: Ctrl+K Command & Config Search (Tier 2)", () => {
  test("F5-T2-01 empty and whitespace queries show default results without crash", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);
    await openCommandPalette(page, "shortcut");

    const input = page.getByTestId("command-palette-input");
    await input.fill("");
    await input.fill("   ");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    guards.assertClean();
  });

  test("F5-T2-02 non-matching gibberish query shows explicit empty state", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await connectMockedConsole(page);
    await openCommandPalette(page, "shortcut");

    await page.getByTestId("command-palette-input").fill("zzzz_nonexistent_9999");
    await expect(page.getByTestId("command-palette")).toContainText(/无匹配|未找到|没有结果/);
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("command-palette")).toBeVisible();
    guards.assertClean();
  });

  test("F5-T2-03 Escape key dismisses command palette cleanly", async ({ page }) => {
    await connectMockedConsole(page);
    await openCommandPalette(page, "shortcut");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("command-palette")).not.toBeVisible();
  });

  test("F5-T2-04 keyboard ArrowDown ArrowUp Enter selects highlighted item", async ({ page }) => {
    await connectMockedConsole(page);
    await openCommandPalette(page, "shortcut");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("command-palette")).not.toBeVisible();
  });

  test("F5-T2-05 Ctrl+K when no server is selected safely guards server-only tabs", async ({ page }) => {
    const guards = attachErrorGuards(page);
    await installMockApi(page, { servers: [] });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await connectConsole(page);
    await expect(page.getByTestId("content-empty-state")).toBeVisible();

    await openCommandPalette(page, "shortcut");
    await page.getByTestId("command-palette-input").fill("模组");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("content-empty-state")).toBeVisible();
    guards.assertClean();
  });
});

test.describe("F6: Action Entry Consolidation & Sync Banner (Tier 1)", () => {
  test("F6-T1-01 unique visible primary action button roles on dashboard", async ({ page }) => {
    await connectMockedConsole(page);
    await expect(page.getByRole("button", { name: "启动" })).toBeVisible();
    // 概览页没有注册配置编辑器，不再出现点了没反应的「保存」
    await expect(page.getByTestId("btn-save")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "应用更改" })).toBeVisible();
  });

  test("F6-T1-02 shell-v2 actions btn-preflight contract preserved on deploy preflight", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "preflight");
    const preflightBtn = page.locator(".shell-v2__actions [data-testid='btn-preflight']");
    await expect(preflightBtn).toHaveCount(1);
    await expect(preflightBtn).toBeVisible();
    await expect(preflightBtn).toHaveText("开服检查");
  });

  test("F6-T1-03 consolidated single Global Settings trigger opens popover cleanly", async ({ page }) => {
    await connectMockedConsole(page);
    const trigger = page.getByRole("button", { name: "全局设置" });
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByText("显示高级设置")).toBeVisible();
  });

  test("F6-T1-04 sync banner appears on dirty config state with role=status", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    const hostnameRow = page.locator(".form-row", { hasText: "服务器名" });
    await hostnameRow.locator("input").fill("Dirty Banner Test");

    const banner = page.getByTestId("sync-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute("role", "status");
  });

  test("F6-T1-05 clicking sync banner action saves and writes game cfg", async ({ page }) => {
    const mock = await connectMockedConsole(page, { cfgStale: true });
    const banner = page.getByTestId("sync-banner");
    await expect(banner).toBeVisible();

    await banner.getByRole("button").click();
    await expect
      .poll(() => mock.getRequests("POST", "/api/v1/task").length)
      .toBeGreaterThan(0);
    await expect(banner).not.toBeVisible();
  });
});

test.describe("F6: Action Entry Consolidation & Sync Banner (Tier 2)", () => {
  test("F6-T2-01 process button disabled states reflect stopped vs running server", async ({ page }) => {
    const mock = await connectMockedConsole(page, { isRunning: false });
    await expect(page.getByRole("button", { name: "启动" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "停止" })).toBeDisabled();

    mock.setRunning(true);
    await page.getByTestId("dashboard-page").getByRole("button", { name: "刷新状态" }).click();
    await expect(page.getByRole("button", { name: "启动" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "停止" })).toBeEnabled();
  });

  test("F6-T2-02 no duplicate visible primary action button roles across console modes", async ({ page }) => {
    await connectMockedConsole(page);
    await expect(page.getByRole("button", { name: "启动" })).toHaveCount(1);
    await navigateConsoleTab(page, "basic");
    // 设置页只保留页级「保存」，顶栏用「应用更改」完成写入/重启闭环
    await expect(page.getByTestId("btn-page-save")).toHaveCount(1);
    await expect(page.getByTestId("btn-save")).toHaveCount(0);
    await expect(page.getByTestId("btn-apply")).toHaveCount(1);
  });

  test("F6-T2-03 sync banner distinguishes unsaved dirty state vs stale cfg state", async ({ page }) => {
    await connectMockedConsole(page, { cfgStale: true });
    const banner = page.getByTestId("sync-banner");
    await expect(banner).toContainText("尚未写入游戏配置文件");

    await navigateConsoleTab(page, "basic");
    await page.locator(".form-row", { hasText: "服务器名" }).locator("input").fill("Edited Host");
    await expect(banner).toContainText("未保存的修改");
  });

  test("F6-T2-04 toggling showAdvancedSettings hides and reveals advanced tabs", async ({ page }) => {
    await connectMockedConsole(page, { showAdvancedSettings: true });
    await page.getByTestId("mode-config").click();
    await expect(page.getByTestId("nav-performance")).toBeVisible();

    await page.getByRole("button", { name: "全局设置" }).click();
    const popover = page.locator(".el-popover .global-settings, .global-settings").first();
    const advRow = popover.locator(".row", { hasText: "显示高级设置" });
    await advRow.locator(".el-checkbox, .el-switch").first().click();
    await popover.getByRole("button", { name: "保存" }).click();

    await expect(page.getByTestId("nav-performance")).not.toBeVisible();
  });

  test("F6-T2-05 failed write_cfg task surfaces error without hiding sync-banner", async ({ page }) => {
    const guards = attachErrorGuards(page, { ignoreNetworkHttpErrors: true });
    await connectMockedConsole(page, { cfgStale: true, writeCfgFail: true });
    const banner = page.getByTestId("sync-banner");
    await expect(banner).toBeVisible();

    await banner.getByRole("button").click();
    await expect(banner).toBeVisible();
    expect(guards.pageErrors).toEqual([]);
  });
});

test.describe("F7: Router & Unsaved-Changes Leave Guard (Tier 1)", () => {
  test("F7-T1-01 switching tabs with dirty config opens UnsavedChangesDialog", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    await page.locator(".form-row", { hasText: "服务器名" }).locator("input").fill("Dirty Tab");

    await page.getByTestId("mode-workshop").click();
    const dialog = page.getByRole("dialog", { name: "未保存的更改" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "取消" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "不保存" })).toBeVisible();
    await expect(dialog.getByTestId("btn-unsaved-save")).toBeVisible();
  });

  test("F7-T1-02 clicking nav-connections with dirty config triggers leave guard", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    await page.locator(".form-row", { hasText: "服务器名" }).locator("input").fill("Dirty Exit");

    await page.getByTestId("nav-connections").click();
    await expect(page.getByRole("dialog", { name: "未保存的更改" })).toBeVisible();
    await expect(page).toHaveURL(/\/basic/);
  });

  test("F7-T1-03 clicking 不保存 discards edits and completes navigation", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    await page.locator(".form-row", { hasText: "服务器名" }).locator("input").fill("Discard Me");

    await page.getByTestId("nav-connections").click();
    const dialog = page.getByRole("dialog", { name: "未保存的更改" });
    await dialog.getByRole("button", { name: "不保存" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(/#\/connections/);
  });

  test("F7-T1-04 clicking 保存 saves changes and completes navigation", async ({ page }) => {
    const mock = await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    await page.locator(".form-row", { hasText: "服务器名" }).locator("input").fill("Save And Go");

    await page.getByTestId("nav-connections").click();
    const dialog = page.getByRole("dialog", { name: "未保存的更改" });
    await dialog.getByTestId("btn-unsaved-save").click();

    await expect
      .poll(() => mock.getRequests("PATCH", "/config").length)
      .toBeGreaterThan(0);
    await expect(page).toHaveURL(/#\/connections/);
  });

  test("F7-T1-05 switching server instance with dirty config triggers leave guard", async ({ page }) => {
    await connectMockedConsole(page, {
      servers: [
        { uuid: "srv-1", configName: "Alpha Server", serverDir: "C:\\arma3\\a" },
        { uuid: "srv-2", configName: "Bravo Server", serverDir: "C:\\arma3\\b" },
      ],
    });
    await navigateConsoleTab(page, "basic");
    await page.locator(".form-row", { hasText: "服务器名" }).locator("input").fill("Dirty Switch");

    await openInstanceMenu(page);
    await page.getByTestId("server-item-srv-2").click();
    await expect(page.getByRole("dialog", { name: "未保存的更改" })).toBeVisible();
  });
});

test.describe("F7: Router & Unsaved-Changes Leave Guard (Tier 2)", () => {
  test("F7-T2-01 clicking 取消 cancels navigation and preserves unsaved edits", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    const input = page.locator(".form-row", { hasText: "服务器名" }).locator("input");
    await input.fill("Unsaved-Keep");

    await page.getByTestId("mode-workshop").click();
    const dialog = page.getByRole("dialog", { name: "未保存的更改" });
    await dialog.getByRole("button", { name: "取消" }).click();

    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(/\/basic/);
    await expect(input).toHaveValue("Unsaved-Keep");
    await expect(page.getByTestId("sync-banner")).toBeVisible();
  });

  test("F7-T2-02 browser Back navigation with dirty edits triggers leave guard", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    await page.locator(".form-row", { hasText: "服务器名" }).locator("input").fill("Dirty Back");

    await page.goBack();
    const dialog = page.getByRole("dialog", { name: "未保存的更改" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "取消" }).click();
    await expect(page).toHaveURL(/\/basic/);
  });

  test("F7-T2-03 clicking 保存 in guard when API fails aborts navigation and keeps edits", async ({ page }) => {
    const guards = attachErrorGuards(page, { ignoreNetworkHttpErrors: true });
    await connectMockedConsole(page, {
      patchConfigErrorStatus: 500,
      patchConfigErrorMessage: "Simulated Save Failure",
    });
    await navigateConsoleTab(page, "basic");
    const input = page.locator(".form-row", { hasText: "服务器名" }).locator("input");
    await input.fill("Keep On Failure");

    await page.getByTestId("nav-connections").click();
    const dialog = page.getByRole("dialog", { name: "未保存的更改" });
    await dialog.getByTestId("btn-unsaved-save").click();

    await expect(page).toHaveURL(/\/basic/);
    await expect(input).toHaveValue("Keep On Failure");
    expect(guards.pageErrors).toEqual([]);
  });

  test("F7-T2-04 window beforeunload prevents default only when dirty", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");

    const cleanPrevented = await page.evaluate(() => {
      const ev = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(cleanPrevented).toBe(false);

    await page.locator(".form-row", { hasText: "服务器名" }).locator("input").fill("BeforeUnload Dirty");
    const dirtyPrevented = await page.evaluate(() => {
      const ev = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented || Boolean((ev as BeforeUnloadEvent).returnValue);
    });
    expect(dirtyPrevented).toBe(true);
  });

  test("F7-T2-05 clean form navigates to connections without confirmation dialog", async ({ page }) => {
    await connectMockedConsole(page);
    await navigateConsoleTab(page, "basic");
    await page.getByTestId("nav-connections").click();
    await expect(page.getByRole("dialog", { name: "未保存的更改" })).not.toBeVisible();
    await expect(page).toHaveURL(/#\/connections/);
  });
});
