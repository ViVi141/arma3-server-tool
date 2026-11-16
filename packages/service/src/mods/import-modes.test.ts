import { describe, it, expect } from "vitest";
import {
  applyEnableList,
  buildModImportPreview,
  normalizeModImportMode,
  shouldDownloadForMode,
} from "./import-modes.js";

describe("normalizeModImportMode", () => {
  it("maps aliases", () => {
    expect(normalizeModImportMode("download_only")).toBe("download_only");
    expect(normalizeModImportMode("merge")).toBe("merge_enable");
    expect(normalizeModImportMode("replace_enable")).toBe("replace_enable");
    expect(normalizeModImportMode("")).toBe("download_and_enable");
  });
});

describe("buildModImportPreview", () => {
  it("does not mutate inputs and classifies statuses", () => {
    const enabled = [1, 2];
    const installed = [1, 3];
    const preview = buildModImportPreview([1, 3, 9], enabled, installed, "merge_enable");
    expect(enabled).toEqual([1, 2]);
    expect(preview.alreadyEnabledCount).toBe(1);
    expect(preview.presentDisabledCount).toBe(1);
    expect(preview.missingCount).toBe(1);
  });
});

describe("applyEnableList", () => {
  it("download_only leaves enable list untouched (null)", () => {
    expect(applyEnableList([1], [2, 3], "download_only")).toBeNull();
  });

  it("merge and replace behave correctly", () => {
    expect(applyEnableList([1], [2, 3], "merge_enable")).toEqual([1, 2, 3]);
    expect(applyEnableList([1], [2, 3], "replace_enable")).toEqual([2, 3]);
    expect(applyEnableList([1], [2], "download_and_enable")).toEqual([1, 2]);
  });
});

describe("shouldDownloadForMode", () => {
  it("downloads for download modes only", () => {
    expect(shouldDownloadForMode("download_only")).toBe(true);
    expect(shouldDownloadForMode("download_and_enable")).toBe(true);
    expect(shouldDownloadForMode("merge_enable")).toBe(false);
    expect(shouldDownloadForMode("replace_enable")).toBe(false);
  });
});
