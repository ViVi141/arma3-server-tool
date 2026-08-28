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
  await page.getByTestId("server-panel").locator("button").first().click();
}

export async function connectConsole(page: Page): Promise<void> {
  await page.getByTestId("btn-connect").first().click();
  await page.waitForURL(/\/console\/local\//, { timeout: 15000 });
}

export async function ensureTestServer(page: Page): Promise<void> {
  await connectConsole(page);
  const items = page.locator("[data-testid^='server-item-']");
  if ((await items.count()) > 0) {
    return;
  }

  await openInstanceMenu(page);
  await page.getByTestId("btn-first-server-wizard").click();
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
  await expect(items.first()).toBeVisible();
}
