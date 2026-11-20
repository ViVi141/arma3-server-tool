import { expect, test } from "@playwright/test";
import { connectMockedConsole, createDefaultMockMods, navigateConsoleTab, type MockModRow } from "./helpers";
import { canDeployModKeys, emptyModFilters, exportModRows, matchesModFilters, restoreModFilters } from "../src/utils/modWorkbench";

function fixture(): MockModRow[] {
  const mods = createDefaultMockMods();
  return [...mods, ...["unknown", "partial", "key_mismatch", "read_error"].map((status, index) => ({
    ...mods[0], name: `证据-${status}`, dirName: `@evidence-${index}`, path: `C:\\mods\\evidence-${index}`,
    workshopId: 900000010 + index, bikeyStatus: status as MockModRow["bikeyStatus"],
    signatureEvidence: {
      checkedAt: "2026-01-01T00:00:00Z", pboCount: 2, signedPboCount: status === "partial" ? 1 : 2,
      missingPbos: status === "partial" ? ["addons/missing.pbo"] : [], keyCount: 1, deployedKeyCount: 0,
      missingKeys: [], mismatchedKeys: [], readErrors: status === "read_error" ? ["EACCES"] : [],
      canDeployKeys: status === "key_mismatch", reason: `${status} 的文件原因`, cryptographicVerified: false as const,
    },
  }))];
}

test("组合筛选：维度 AND、同维度 OR、未知状态与 150 行规模", () => {
  const rows = Array.from({ length: 150 }, (_, index) => ({ ...fixture()[index % 8], path: `/mods/${index}` }));
  const filters = emptyModFilters();
  expect(rows.filter((row) => matchesModFilters(row, filters))).toHaveLength(150);
  filters.enabled = ["enabled"];
  filters.signatures = ["unknown", "partial", "read_error"];
  filters.roles = ["client", "hc"];
  expect(rows.filter((row) => matchesModFilters(row, filters))).toHaveLength(56);
  filters.sources = ["local"];
  expect(rows.filter((row) => matchesModFilters(row, filters))).toHaveLength(0);
  filters.sources = ["workshop"];
  filters.search = "/mods/4";
  expect(rows.filter((row) => matchesModFilters(row, filters)).every((row) => row.path.includes("/mods/4"))).toBe(true);
  expect(restoreModFilters("broken")).toEqual(emptyModFilters());
  expect(restoreModFilters('{"signatures":["unknown","invalid"],"roles":42}').signatures).toEqual(["unknown"]);
});

test("清单导出包含名称 ID 原因，CSV 转义并避免公式注入", () => {
  const row = { ...fixture()[0], name: '=HYPERLINK("bad")', bikeyHint: "第一行\n第二行,原因" };
  const csv = exportModRows([row], true);
  expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  expect(csv).toContain('"第一行\n第二行,原因"');
  expect(exportModRows([row])).toContain("450814997");
  expect(exportModRows([row])).toContain("第一行 第二行,原因");
  expect(canDeployModKeys(fixture()[5])).toBe(false);
  expect(canDeployModKeys(fixture()[6])).toBe(true);
});

test("未知与读取失败留在已启用待处理清单，筛选刷新持久化", async ({ page }, testInfo) => {
  await connectMockedConsole(page, { mods: fixture(), autoCopyBikey: false });
  await navigateConsoleTab(page, "mods");
  await page.getByTestId("mods-filter-attention").click();
  await expect(page.getByText("共 5 项")).toBeVisible();
  await expect(page.getByText("证据-unknown", { exact: true })).toBeVisible();
  await expect(page.getByText("证据-read_error", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "搜索名称、ID 或路径" }).fill("证据-partial");
  await expect(page.getByText("共 1 项")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "搜索名称、ID 或路径" })).toHaveValue("证据-partial");
  await expect(page.getByText("共 1 项")).toBeVisible();
  await expect(page.getByTestId("btn-copy-missing-bikey")).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath("signature-workbench.png"), fullPage: true });
});

test("点击分类与角色组合，不把相同维度多选当成互斥", async ({ page }) => {
  await connectMockedConsole(page, { mods: fixture(), autoCopyBikey: false });
  await navigateConsoleTab(page, "mods");
  await page.getByTestId("mods-count-unknown").click();
  await page.getByTestId("mods-count-read_error").click();
  await expect(page.getByText("共 2 项")).toBeVisible();
  await page.getByTestId("mods-role-filter").click();
  await page.getByRole("option", { name: "HC", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("共 0 项")).toBeVisible();
});

test("批量部署只提交当前筛选显式选择项，取消不写入，完成后清除失效选择", async ({ page }) => {
  const mock = await connectMockedConsole(page, { mods: fixture(), autoCopyBikey: false });
  await navigateConsoleTab(page, "mods");
  await expect(page.getByTestId("btn-copy-missing-bikey")).toBeDisabled();
  await page.getByTestId("mods-select-keys").click();
  await expect(page.getByTestId("btn-copy-missing-bikey")).toContainText("2 个模组");
  await page.getByRole("textbox", { name: "搜索名称、ID 或路径" }).fill("TFAR");
  await expect(page.getByTestId("btn-copy-missing-bikey")).toContainText("1 个模组");
  await page.getByTestId("btn-copy-missing-bikey").click();
  const confirm = page.getByRole("dialog", { name: "确认公钥部署范围" });
  await expect(confirm).toContainText("C:\\arma3\\mods\\@TFAR");
  await confirm.getByRole("button", { name: "取消", exact: true }).click();
  expect(mock.getRequests("POST", "/api/v1/task")).toHaveLength(0);
  await page.getByTestId("btn-copy-missing-bikey").click();
  await confirm.getByRole("button", { name: "部署并复扫" }).click();
  await expect.poll(() => mock.getRequests("POST", "/api/v1/task").length).toBe(1);
  const body = mock.getRequests("POST", "/api/v1/task")[0].body as { commands: { action: string; modPaths: string[] }[] };
  expect(body.commands[0].modPaths).toEqual(["C:\\arma3\\mods\\@TFAR"]);
  await expect(page.getByTestId("btn-copy-missing-bikey")).toBeDisabled();
  await page.getByRole("textbox", { name: "搜索名称、ID 或路径" }).fill("证据-key_mismatch");
  await expect(page.getByTestId("btn-copy-missing-bikey")).toContainText("1 个模组");
  mock.setMods(fixture().filter((row) => row.bikeyStatus !== "key_mismatch"));
  await page.getByRole("button", { name: "扫描刷新" }).click();
  await expect(page.getByTestId("btn-copy-missing-bikey")).toBeDisabled();
});

test("CSV 下载严格包含当前筛选结果", async ({ page }) => {
  await connectMockedConsole(page, { mods: fixture(), autoCopyBikey: false });
  await navigateConsoleTab(page, "mods");
  await page.getByRole("textbox", { name: "搜索名称、ID 或路径" }).fill("证据-read_error");
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("mods-export-csv").click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const content = Buffer.concat(chunks).toString("utf8");
  expect(content).toContain("证据-read_error");
  expect(content).toContain("read_error 的文件原因");
  expect(content).not.toContain("CBA_A3");
});
