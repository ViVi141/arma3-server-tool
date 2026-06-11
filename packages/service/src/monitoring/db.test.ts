import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { MonitoringDb } from "./db.js";

let tmpDir: string;
let db: MonitoringDb;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a3st-mon-test-"));
  db = new MonitoringDb(tmpDir);
  await db.waitReady();
});

afterAll(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("MonitoringDb", () => {
  it("records stats", () => {
    db.recordStats("uuid-1", 10, 60.5);
    const summary = db.getSummary("uuid-1");
    expect(summary.totalEntries).toBeGreaterThanOrEqual(1);
  });

  it("records multiple stats points", () => {
    db.recordStats("uuid-1", 5);
    db.recordStats("uuid-1", 15);
    db.recordStats("uuid-1", 8);

    const summary = db.getSummary("uuid-1");
    expect(summary.avgPlayers).toBeGreaterThan(0);
    expect(summary.peakPlayers).toBe(15);
  });

  it("records a player", () => {
    db.recordPlayer({
      playerGuid: "abc123",
      playerName: "Player1",
      serverUuid: "uuid-1",
      lastSeen: new Date().toISOString(),
    });

    // Update same player
    db.recordPlayer({
      playerGuid: "abc123",
      playerName: "Player1_Renamed",
      serverUuid: "uuid-1",
      lastSeen: new Date().toISOString(),
    });
  });

  it("batch inserts players", () => {
    db.batchInsertPlayers([
      { playerGuid: "p1", playerName: "Alice", serverUuid: "uuid-1", lastSeen: "" },
      { playerGuid: "p2", playerName: "Bob", serverUuid: "uuid-1", lastSeen: "" },
    ]);
  });

  it("getStats returns records within time window", () => {
    const stats = db.getStats("uuid-1", 24);
    expect(stats.length).toBeGreaterThan(0);
    expect(stats[0].serverUuid).toBe("uuid-1");
    expect(typeof stats[0].playerCount).toBe("number");
  });

  it("getStats returns empty for unknown server", () => {
    const stats = db.getStats("no-such", 24);
    expect(stats).toEqual([]);
  });

  it("getSummary returns zeros for unknown server", () => {
    const s = db.getSummary("no-such");
    expect(s.avgPlayers).toBe(0);
    expect(s.peakPlayers).toBe(0);
    expect(s.totalEntries).toBe(0);
  });
});
