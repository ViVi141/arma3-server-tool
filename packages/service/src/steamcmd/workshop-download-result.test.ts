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
});
