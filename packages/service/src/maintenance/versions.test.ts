import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { parseWorkshopKeyValues, stringifyWorkshopKeyValues } from "../steamcmd/workshop-acf.js";
import { compareWorkshopVersions, readInstalledWorkshopVersion, remoteWorkshopVersion } from "./versions.js";

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-versions-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
function library(name: string, time = 1700000000) {
  const dir = path.join(root, name, "steamapps", "workshop"); const mod = path.join(dir, "content", "107410", "123");
  fs.mkdirSync(mod, { recursive: true });
  const acf = path.join(dir, "appworkshop_107410.acf");
  fs.writeFileSync(acf, `"AppWorkshop" { "appid" "107410" "WorkshopItemsInstalled" { "123" { "manifest" "18446744073709551614" "size" "1000" "timeupdated" "${time}" } } "WorkshopItemDetails" { "123" { "timeupdated" "1999999999" } } }`);
  return { mod, acf };
}
describe("维护版本证据", () => {
  it("只读取对应物理副本的已安装版本，不取 details 缓存、mtime 或同步标记", () => {
    const one = library("one"); const two = library("two", 1700000002);
    fs.writeFileSync(path.join(one.mod, ".a3st-synced"), "2099-01-01T00:00:00Z");
    expect(readInstalledWorkshopVersion(one.mod, 123)).toMatchObject({ timeUpdated: 1700000000, manifest: "18446744073709551614", sizeBytes: 1000 });
    expect(readInstalledWorkshopVersion(two.mod, 123)?.timeUpdated).toBe(1700000002);
    expect(readInstalledWorkshopVersion(one.mod, 456)).toBeNull();
    const loose = path.join(root, "123"); fs.mkdirSync(loose);
    expect(readInstalledWorkshopVersion(loose, 123)).toBeNull();
    const alias = path.join(root, "alias"); fs.symlinkSync(one.mod, alias, process.platform === "win32" ? "junction" : "dir");
    expect(readInstalledWorkshopVersion(alias, 123)?.timeUpdated).toBe(1700000000);
  });
  it("ACF 丢失、截断、重复键和缺少 installed 条目都保留未知", () => {
    const { mod, acf } = library("one");
    for (const value of ['"AppWorkshop" {', '"AppWorkshop" { "appid" "107410" "appid" "107410" }', '"AppWorkshop" { "appid" "107410" "WorkshopItemDetails" { "123" { "timeupdated" "1999999999" } } }']) {
      fs.writeFileSync(acf, value); expect(readInstalledWorkshopVersion(mod, 123)).toBeNull();
    }
    fs.unlinkSync(acf); expect(readInstalledWorkshopVersion(mod, 123)).toBeNull();
  });
  it("VDF 结构与转义可往返，缓存条目保留但不会冒充已安装条目", () => {
    const value = { AppWorkshop: { appid: "107410", path: 'C:\\mods\\"name"', note: "{ } // value", nested: {} } };
    expect(parseWorkshopKeyValues(`// 注释\n${stringifyWorkshopKeyValues(value)}`)).toEqual(value);
    for (const text of ['"key" "a" "key" "b"', '"key" { "value"', '"key" { } }', 'unquoted']) expect(() => parseWorkshopKeyValues(text)).toThrow("ACF");
  });
  it("更新比较没有半小时容差；远程未知、倒退和同时间不同大小都不能宣称已最新", () => {
    const local = readInstalledWorkshopVersion(library("one").mod, 123)!;
    expect(compareWorkshopVersions(local, { timeUpdated: local.timeUpdated + 1, sizeBytes: 1000 })).toBe("outdated");
    expect(compareWorkshopVersions(local, local)).toBe("up_to_date");
    for (const remote of [null, { timeUpdated: local.timeUpdated - 1, sizeBytes: 1000 }, { timeUpdated: local.timeUpdated, sizeBytes: 999 }]) expect(compareWorkshopVersions(local, remote)).toBe("unknown");
    expect(remoteWorkshopVersion({ modId: 123, title: "", description: "", fileSizeMb: "1 MB", selected: true, source: "html", timeUpdated: 1700000000, fileSizeBytes: 1000 })).toBeNull();
  });
});
