import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadWorkshopAcfTimesForLocalMods,
  parseAppWorkshopTimeUpdatedMap,
  resolveAppWorkshopAcfPath,
} from "./workshop-acf.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-acf-"));
  tempDirs.push(dir);
  return dir;
}

describe("parseAppWorkshopTimeUpdatedMap", () => {
  it("reads timeupdated from WorkshopItemsInstalled blocks", () => {
    const acf = `
"AppWorkshop"
{
	"AppId"		"107410"
	"WorkshopItemsInstalled"
	{
		"450814997"
		{
			"size"		"1048576"
			"timeupdated"		"1700000000"
			"manifest"		"abc"
		}
		"2935338016"
		{
			"size"		"3890048"
			"timeupdated"		"1739123456"
			"manifest"		"def"
		}
	}
}
`;
    const map = parseAppWorkshopTimeUpdatedMap(acf);
    expect(map.get(450814997)).toBe(1700000000);
    expect(map.get(2935338016)).toBe(1739123456);
  });

  it("keeps the newer timeupdated when an id appears twice", () => {
    const acf = `
"450814997"
{
	"timeupdated"		"100"
}
"450814997"
{
	"timeupdated"		"200"
}
`;
    expect(parseAppWorkshopTimeUpdatedMap(acf).get(450814997)).toBe(200);
  });
});

describe("resolveAppWorkshopAcfPath + loadWorkshopAcfTimesForLocalMods", () => {
  it("resolves ACF from a mod content path and loads times", () => {
    const root = makeTempDir();
    const workshopDir = path.join(root, "steamapps", "workshop");
    const modPath = path.join(workshopDir, "content", "107410", "450814997");
    fs.mkdirSync(modPath, { recursive: true });
    const acfPath = path.join(workshopDir, "appworkshop_107410.acf");
    fs.writeFileSync(
      acfPath,
      `"450814997"\n{\n\t"timeupdated"\t\t"1700001111"\n}\n`,
      "utf-8",
    );

    expect(resolveAppWorkshopAcfPath(modPath)).toBe(acfPath);
    const times = loadWorkshopAcfTimesForLocalMods([
      { modId: 450814997, path: modPath },
    ]);
    expect(times.get(450814997)).toBe(1700001111);
  });
});
