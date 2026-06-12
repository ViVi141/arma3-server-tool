import { describe, it, expect } from "vitest";
import { parseModDetails } from "./workshop-api.js";

describe("parseModDetails", () => {
  it("parses title and file size from Steam JSON segment", () => {
    const json = `{"publishedfileid": "450814997", "creator_app_id": "107410", "title": "CBA_A3", "file_size": "1048576"}`;
    const mods = parseModDetails(json, [450814997]);
    expect(mods.length).toBe(1);
    expect(mods[0].title).toBe("CBA_A3");
    expect(mods[0].fileSizeMb).toContain("MB");
  });

  it("returns fallback when JSON is empty", () => {
    const mods = parseModDetails("", [1234567]);
    expect(mods[0].modId).toBe(1234567);
    expect(mods[0].title).toContain("Workshop");
  });
});
