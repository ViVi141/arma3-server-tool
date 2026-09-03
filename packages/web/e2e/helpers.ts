import { expect, type Page } from "@playwright/test";

const TAB_TO_MODE: Record<string, string> = {
  dashboard: "overview",
  preflight: "deploy",
  snapshots: "deploy",
  scheduler: "deploy",
  mods: "workshop",
  steamcmd: "workshop",
  missions: "workshop",
  logs: "logs",
  rcon: "logs",
  statistics: "logs",
  basic: "config",
  performance: "config",
  network: "config",
  security: "config",
  difficulty: "config",
  log: "config",
  config: "config",
  bans: "system",
  about: "system",
};

export async function navigateConsoleTab(page: Page, tab: string): Promise<void> {
  const mode = TAB_TO_MODE[tab] ?? "overview";
  if (tab !== "dashboard") {
    await page.getByTestId(`mode-${mode}`).click();
  }
  const subNav = page.getByTestId(`nav-${tab}`);
  if (await subNav.isVisible()) {
    await subNav.click();
  }
}

export async function openInstanceMenu(page: Page): Promise<void> {
  const list = page.getByTestId("server-list");
  if (await list.isVisible()) {
    return;
  }
  await page.getByTestId("server-panel").locator("button").first().click();
  await expect(list).toBeVisible();
}

export async function connectConsole(page: Page): Promise<void> {
  const connectBtn = page.getByTestId("btn-connect").first();
  await expect(connectBtn).toBeVisible();
  await expect(connectBtn).toBeEnabled();

  // Hash 要等懒加载的 ServerConsoleView resolve 后才变；冷 Vite 在 Linux CI 上可能很慢。
  const healthPromise = page.waitForResponse(
    (response) => {
      return response.url().includes("/api/v1/health") && response.request().method() === "GET";
    },
    { timeout: 20000 }
  );
  await connectBtn.click();
  const healthResponse = await healthPromise;
  if (!healthResponse.ok()) {
    throw new Error(`Health check HTTP ${healthResponse.status()}`);
  }

  await expect(page).toHaveURL(/#\/console\/local\//, { timeout: 60000 });
  await expect(page.getByTestId("console-shell")).toBeVisible({ timeout: 30000 });
}

async function waitForConsoleSettled(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      if (await page.getByTestId("content-empty-state").isVisible()) {
        return "empty";
      }
      if (await page.getByTestId("dashboard-page").isVisible()) {
        return "dashboard";
      }
      if (await page.getByRole("button", { name: "启动" }).isVisible()) {
        return "toolbar";
      }
      return "pending";
    }, { timeout: 15000 })
    .not.toBe("pending");
}

export async function openFirstServerWizard(page: Page): Promise<void> {
  await waitForConsoleSettled(page);
  const emptyState = page.getByTestId("content-empty-state");
  if (await emptyState.isVisible()) {
    await page.getByTestId("btn-first-server-wizard-main").click();
    return;
  }
  await openInstanceMenu(page);
  await page.getByTestId("btn-first-server-wizard").click();
}

export async function ensureTestServer(page: Page): Promise<void> {
  await connectConsole(page);
  await waitForConsoleSettled(page);

  const emptyState = page.getByTestId("content-empty-state");
  if (!(await emptyState.isVisible())) {
    return;
  }

  await page.getByTestId("btn-first-server-wizard-main").click();
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-config-name").fill("E2E Server");
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
}
