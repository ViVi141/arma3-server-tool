import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { captureWorkshopRecords, restoreWorkshopRecords, verifyWorkshopRecordsUnchanged } from "./version-records.js";
import { parseWorkshopKeyValues, stringifyWorkshopKeyValues, workshopSection, type WorkshopKeyValues } from "../steamcmd/workshop-acf.js";

vi.mock("node:fs/promises", async (original) => { const actual = await original<typeof import("node:fs/promises")>(); return { ...actual, rename: vi.fn(actual.rename) }; });
let dir: string, acf: string;
const entry = (manifest: string, size = "10") => ({ manifest, size, timeupdated: manifest });
async function write(app: WorkshopKeyValues) { await fs.writeFile(acf, stringifyWorkshopKeyValues({ AppWorkshop: app })); }
async function read() { return workshopSection(parseWorkshopKeyValues(await fs.readFile(acf, "utf8")).AppWorkshop)!; }
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "a3st-records-")); acf = path.join(dir, "appworkshop_107410.acf"); await write({ appid: "107410", SizeOnDisk: "30", WorkshopItemsInstalled: { "1": entry("18446744073709551614"), "2": entry("2", "20") }, WorkshopItemDetails: { "1": { manifest: "10" }, "2": { manifest: "20" } } }); });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(dir, { recursive: true, force: true }); });

describe("Workshop 版本记录局部回滚", () => {
  it("只捕获目标 ID，恢复保留其他模组的新记录、额外字段及 uint64 manifest", async () => {
    const saved = await captureWorkshopRecords([{ modId: 1, acfPath: acf }, { modId: 1, acfPath: acf }]);
    expect(saved).toHaveLength(1); expect(saved[0].items).toHaveLength(1);
    expect(JSON.stringify(saved)).not.toContain('"manifest":"20"');
    await verifyWorkshopRecordsUnchanged(saved);
    await write({ appid: "107410", SizeOnDisk: "120", extra: "keep-new", WorkshopItemsInstalled: { "1": entry("100", "70"), "2": entry("200", "50") }, WorkshopItemDetails: { "1": { manifest: "100" }, "2": { manifest: "200" } } });
    await expect(verifyWorkshopRecordsUnchanged(saved)).rejects.toThrow("发生变化");
    await restoreWorkshopRecords(JSON.parse(JSON.stringify(saved)));
    const value = await read();
    expect(workshopSection(value.WorkshopItemsInstalled)).toEqual({ "1": entry("18446744073709551614"), "2": entry("200", "50") });
    expect(value).toMatchObject({ SizeOnDisk: "60", extra: "keep-new", WorkshopItemDetails: { "1": { manifest: "10" }, "2": { manifest: "200" } } });
    await restoreWorkshopRecords(saved); expect(await read()).toEqual(value);
  });
  it("原本没有本目标详情时只移除新增目标条目，不删除其他 ID", async () => {
    await write({ appid: "107410", WorkshopItemsInstalled: { "1": entry("1") } });
    const saved = await captureWorkshopRecords([{ modId: 1, acfPath: acf }]);
    await write({ appid: "107410", WorkshopItemsInstalled: { "1": entry("100") }, WorkshopItemDetails: { "1": { manifest: "100" }, "2": { manifest: "200" } } });
    await restoreWorkshopRecords(saved);
    expect((await read()).WorkshopItemDetails).toEqual({ "2": { manifest: "200" } });
  });
  it("同 ID 独立库分别恢复；截断 ACF 不覆盖现场、不先修改另一库", async () => {
    const second = path.join(dir, "other.acf"); await fs.copyFile(acf, second);
    const saved = await captureWorkshopRecords([{ modId: 1, acfPath: acf }, { modId: 1, acfPath: second }]);
    await write({ appid: "107410", WorkshopItemsInstalled: { "1": entry("100") } });
    await fs.writeFile(second, '"AppWorkshop" {');
    const before = await fs.readFile(acf, "utf8");
    await expect(restoreWorkshopRecords(saved)).rejects.toThrow();
    expect(await fs.readFile(acf, "utf8")).toBe(before); expect(await fs.readFile(second, "utf8")).toBe('"AppWorkshop" {');
  });
  it("无已安装记录、重复/不可信字段和链接均拒绝，不能用缓存详情冒充已安装", async () => {
    await expect(captureWorkshopRecords([{ modId: 999, acfPath: acf }])).rejects.toThrow("缺少已安装");
    await expect(captureWorkshopRecords([{ modId: NaN, acfPath: acf }])).rejects.toThrow("无效");
    const saved = await captureWorkshopRecords([{ modId: 1, acfPath: acf }]);
    await expect(restoreWorkshopRecords([...saved, ...saved])).rejects.toThrow("重复");
    const hardlink = path.join(dir, "hardlink.acf"); await fs.link(acf, hardlink);
    await expect(captureWorkshopRecords([{ modId: 1, acfPath: acf }])).rejects.toThrow("链接");
  });
  it("原子替换失败保留当前 ACF，清理仅属于本次的临时文件", async () => {
    const saved = await captureWorkshopRecords([{ modId: 1, acfPath: acf }]);
    await write({ appid: "107410", WorkshopItemsInstalled: { "1": entry("100") } });
    const before = await fs.readFile(acf, "utf8");
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error("injected rename failure"));
    await expect(restoreWorkshopRecords(saved)).rejects.toThrow("rename failure");
    expect(await fs.readFile(acf, "utf8")).toBe(before);
    expect(await fs.readdir(dir)).toEqual(["appworkshop_107410.acf"]);
  });
});
