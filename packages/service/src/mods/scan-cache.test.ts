import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  buildModScanFingerprint,
  clearModScanCacheForTests,
  getCachedModScan,
  invalidateModScanCache,
  setCachedModScan,
  type ModScanCacheEntry,
} from "./scan-cache.js";

function sampleEntry(fingerprint: string): ModScanCacheEntry {
  return {
    mods: [],
    scanPathCount: 1,
    bikeySummary: {
      enabled: 0,
      missingBikey: 0,
      ready: 0,
      notCopied: 0,
      noKey: 0,
      needsAttention: 0,
      unsigned: 0,
      partial: 0,
      keyMismatch: 0,
      readError: 0,
      unchecked: 0,
      allValid: false,
    },
    fingerprint,
    cachedAt: Date.now(),
  };
}

describe("mod scan cache", () => {
  afterEach(() => {
    clearModScanCacheForTests();
  });

  it("hits when fingerprint and mode match within TTL", () => {
    const fingerprint = "fp-a";
    setCachedModScan("srv-1", "shallow", sampleEntry(fingerprint));
    expect(getCachedModScan("srv-1", fingerprint, "shallow")?.scanPathCount).toBe(1);
    expect(getCachedModScan("srv-1", fingerprint, "full")).toBeNull();
    expect(getCachedModScan("srv-1", "other", "shallow")).toBeNull();
  });

  it("expires after TTL and invalidates per server", () => {
    const fingerprint = "fp-b";
    const entry = sampleEntry(fingerprint);
    entry.cachedAt = Date.now() - 60_000;
    setCachedModScan("srv-1", "shallow", entry);
    expect(getCachedModScan("srv-1", fingerprint, "shallow", Date.now(), 45_000)).toBeNull();

    setCachedModScan("srv-1", "shallow", sampleEntry(fingerprint));
    setCachedModScan("srv-1", "full", sampleEntry(`${fingerprint}-full`));
    setCachedModScan("srv-2", "shallow", sampleEntry(fingerprint));
    invalidateModScanCache("srv-1");
    expect(getCachedModScan("srv-1", fingerprint, "shallow")).toBeNull();
    expect(getCachedModScan("srv-1", `${fingerprint}-full`, "full")).toBeNull();
    expect(getCachedModScan("srv-2", fingerprint, "shallow")?.scanPathCount).toBe(1);
  });

  it("fingerprint changes when scan root mtime changes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-scan-fp-"));
    try {
      const before = buildModScanFingerprint([root], "shallow", true);
      const keys = path.join(root, "keys");
      fs.mkdirSync(keys, { recursive: true });
      fs.writeFileSync(path.join(keys, "a.bikey"), "k");
      const st = fs.statSync(keys);
      fs.utimesSync(keys, st.atime, new Date(st.mtimeMs + 2000));
      const after = buildModScanFingerprint([root], "shallow", true);
      expect(after).not.toBe(before);
      expect(buildModScanFingerprint([root], "full", true)).not.toBe(after);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
