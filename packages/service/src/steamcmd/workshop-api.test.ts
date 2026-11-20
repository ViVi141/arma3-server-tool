import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWorkshopVersions, parseModDetails, parseWorkshopFileDetailsHtml } from "./workshop-api.js";
import { proxyFetch } from "./proxy-fetch.js";
vi.mock("./proxy-fetch.js", () => ({ proxyFetch: vi.fn() }));
afterEach(() => { vi.resetAllMocks(); });
import {
  formatUnixTime,
  resolveUpdateStatus,
  updateStatusLabel,
} from "./workshop-update.js";

describe("parseModDetails", () => {
  it("parses title, file size and time_updated from Steam JSON segment", () => {
    const json =
      '{"publishedfileid": "450814997", "creator_app_id": "107410", "title": "CBA_A3", "file_size": "1048576", "time_updated": 1700000000}';
    const mods = parseModDetails(json, [450814997]);
    expect(mods.length).toBe(1);
    expect(mods[0].title).toBe("CBA_A3");
    expect(mods[0].fileSizeMb).toContain("MB");
    expect(mods[0].timeUpdated).toBe(1700000000);
    expect(mods[0].source).toBe("api");
  });

  it("精确匹配相邻 JSON 对象、Unicode 和数字大小；缺失/失败/跨游戏/重复项保持未知", () => {
    const item = (id: number) => ({ publishedfileid: String(id), result: 1, creator_app_id: 107410, title: `模组${id}`, time_updated: 1700000000 + id, file_size: 1024 + id });
    const payload = [item(1), item(2), { ...item(4), result: 9 }, { ...item(5), creator_app_id: 999, title: "107410" }, item(6), item(6)];
    const result = parseModDetails(JSON.stringify({ response: { publishedfiledetails: payload } }), [2, 1, 3, 4, 5, 6, 2]);
    expect(result).toHaveLength(6);
    expect(result[0]).toMatchObject({ modId: 2, title: "模组2", timeUpdated: 1700000002, fileSizeBytes: 1026 });
    expect(result[1]).toMatchObject({ modId: 1, title: "模组1", timeUpdated: 1700000001, fileSizeBytes: 1025 });
    expect(result.slice(2).every((mod) => mod.source === "fallback" && mod.timeUpdated === undefined)).toBe(true);
    expect(parseModDetails('{"publishedfileid":1,broken', [1])[0].source).toBe("fallback");
  });
  it("维护远程查询按 ID 去重且每批最多 100 个；网络失败不使用 HTML 或旧版本", async () => {
    vi.mocked(proxyFetch).mockImplementation(async (_url, init) => {
      const fields = new URLSearchParams(String(init?.body));
      const ids = Array.from({ length: Number(fields.get("itemcount")) }, (_, index) => fields.get(`publishedfileids[${index}]`));
      return { ok: true, text: async () => JSON.stringify({ response: { publishedfiledetails: ids.map((id) => ({ publishedfileid: id, result: 1, creator_app_id: 107410, file_size: "123", time_updated: 1700000000 })) } }) } as Awaited<ReturnType<typeof proxyFetch>>;
    });
    const ids = Array.from({ length: 201 }, (_, index) => index + 1);
    const values = await fetchWorkshopVersions([...ids, ...ids]);
    expect(values).toHaveLength(201); expect(proxyFetch).toHaveBeenCalledTimes(3);
    expect(new URLSearchParams(String(vi.mocked(proxyFetch).mock.calls[0][1]?.body)).get("itemcount")).toBe("100");
    vi.mocked(proxyFetch).mockRejectedValue(new Error("network"));
    expect((await fetchWorkshopVersions([1]))[0]).toMatchObject({ source: "fallback" });
    expect(proxyFetch).toHaveBeenCalledTimes(4);
  });

  it("returns fallback when JSON is empty", () => {
    const mods = parseModDetails("", [1234567]);
    expect(mods[0].modId).toBe(1234567);
    expect(mods[0].title).toContain("Workshop");
    expect(mods[0].source).toBe("fallback");
  });
});

describe("parseWorkshopFileDetailsHtml", () => {
  it("parses filedetails HTML for Animated Grenade Throwing", () => {
    const html = `
      <div class="workshopItemTitle">Animated Grenade Throwing</div>
      <div class="workshopItemDescription">Throw grenades with style</div>
      File Size </div> <div class="detailsStatRight">3.708 MB</div>
      "publishedfileid":"2935338016","creator_app_id":107410,"time_updated":1739123456,"file_size":"3890048","title":"Animated Grenade Throwing"
    `;
    const mod = parseWorkshopFileDetailsHtml(html, 2935338016);
    expect(mod).not.toBeNull();
    expect(mod?.title).toBe("Animated Grenade Throwing");
    expect(mod?.timeUpdated).toBe(1739123456);
    expect(mod?.source).toBe("html");
  });
});

describe("workshop update helpers", () => {
  it("marks local copy outdated when remote is clearly newer (beyond skew tolerance)", () => {
    // remote newer by ~2h exceeds the 30-min clock-skew tolerance
    const status = resolveUpdateStatus(1700007200, 1700000000000, true);
    expect(status).toBe("outdated");
    expect(updateStatusLabel(status)).toBe("有更新");
  });

  it("treats small remote-newer deltas as up to date (clock skew / mtime lag)", () => {
    const status = resolveUpdateStatus(1700000200, 1700000000000, true);
    expect(status).toBe("up_to_date");
  });

  it("marks local copy up to date when local mtime is newer", () => {
    const status = resolveUpdateStatus(1700000000, 1700000100000, true);
    expect(status).toBe("up_to_date");
  });

  it("formats unix time", () => {
    expect(formatUnixTime(1700000000)).not.toBe("-");
  });
});
