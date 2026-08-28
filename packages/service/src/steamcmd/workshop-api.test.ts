import { describe, it, expect } from "vitest";
import { parseModDetails, parseWorkshopFileDetailsHtml } from "./workshop-api.js";
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
  it("marks local copy outdated when remote is newer", () => {
    const status = resolveUpdateStatus(1700000200, 1700000000000, true);
    expect(status).toBe("outdated");
    expect(updateStatusLabel(status)).toBe("有更新");
  });

  it("marks local copy up to date when local mtime is newer", () => {
    const status = resolveUpdateStatus(1700000000, 1700000100000, true);
    expect(status).toBe("up_to_date");
  });

  it("formats unix time", () => {
    expect(formatUnixTime(1700000000)).not.toBe("-");
  });
});
