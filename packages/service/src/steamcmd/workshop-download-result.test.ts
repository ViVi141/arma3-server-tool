import { describe, it, expect } from "vitest";
import {
  hasWorkshopDownloadFailure,
  parseWorkshopDownloadFailureIds,
  parseWorkshopDownloadSuccessIds,
  resolveWorkshopDownloadMissingIds,
} from "./workshop-download-result.js";

describe("workshop-download-result", () => {
  const sample = `
Success. Downloaded item 450814997 to "/tmp/450814997" (100 bytes)
Downloading item 583496184 ...
ERROR! Timeout downloading item 583496184
Unloading Steam API...
OK
`;

  it("parses success ids", () => {
    expect(parseWorkshopDownloadSuccessIds(sample)).toEqual([450814997]);
  });

  it("parses timeout failure ids", () => {
    expect(parseWorkshopDownloadFailureIds(sample)).toEqual([583496184]);
    expect(hasWorkshopDownloadFailure(sample)).toBe(true);
  });

  it("marks never-succeeded items as missing", () => {
    expect(
      resolveWorkshopDownloadMissingIds([450814997, 583496184, 111], sample),
    ).toEqual([583496184, 111]);
  });

  it("treats later success as recovered even if earlier timeout existed", () => {
    const recovered =
      sample + "\nSuccess. Downloaded item 583496184 to \"/tmp/583496184\" (100 bytes)\n";
    expect(resolveWorkshopDownloadMissingIds([450814997, 583496184], recovered)).toEqual([]);
  });

  it("recognizes 'file exists up to date' as success", () => {
    const output = "Success. File exists up to date (450814997)\n";
    expect(parseWorkshopDownloadSuccessIds(output)).toEqual([450814997]);
    expect(resolveWorkshopDownloadMissingIds([450814997], output)).toEqual([]);
  });

  it("does not mark up-to-date mods as missing after a fresh download of another", () => {
    const mixed =
      'Success. Downloaded item 450814997 to "C:\\steamapps\\workshop\\450814997" (100 bytes)\n' +
      "450814997: up to date\n" +
      "Success. File exists up to date (1372685250)\n";
    expect(
      resolveWorkshopDownloadMissingIds([450814997, 1372685250], mixed),
    ).toEqual([]);
  });
});
