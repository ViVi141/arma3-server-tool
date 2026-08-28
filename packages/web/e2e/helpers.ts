import { expect, type Page } from "@playwright/test";

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
