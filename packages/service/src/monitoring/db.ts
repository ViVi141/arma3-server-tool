import initSqlJs, { type Database as SqlDb, type QueryExecResult, type SqlJsValue } from "sql.js";
import * as fs from "node:fs";
import * as path from "node:path";

export interface PlayerRecord {
  playerGuid: string;
  playerName: string;
  serverUuid: string;
  lastSeen: string;
}

export interface StatsRecord {
  serverUuid: string;
  playerCount: number;
  timestamp: string;
  serverFps?: number;
}

export class MonitoringDb {
  private db!: SqlDb;
  private dbPath: string;
  private ready: Promise<void>;

  constructor(dbPath: string) {
    this.dbPath = path.join(dbPath, "a3st_statistics.db");
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });

    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }
    this.db.run("PRAGMA journal_mode=WAL");

    this.db.run(`
      CREATE TABLE IF NOT EXISTS a3st_statistics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_uuid TEXT NOT NULL,
        player_count INTEGER NOT NULL DEFAULT 0,
        server_fps REAL,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_stats_server_time
        ON a3st_statistics(server_uuid, recorded_at)
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS a3st_players (
        guid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        server_uuid TEXT NOT NULL,
        first_seen TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    this.save();
  }

  private save(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    const temp = this.dbPath + ".tmp";
    fs.writeFileSync(temp, buffer);
    fs.renameSync(temp, this.dbPath);
  }

  async waitReady(): Promise<void> {
    await this.ready;
  }

  recordStats(serverUuid: string, playerCount: number, fps?: number): void {
    this.db.run(
      "INSERT INTO a3st_statistics (server_uuid, player_count, server_fps) VALUES (?, ?, ?)",
      [serverUuid, playerCount, fps ?? null]
    );
    this.save();
  }

  recordPlayer(player: PlayerRecord): void {
    this.db.run(
      `INSERT INTO a3st_players (guid, name, server_uuid, last_seen)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(guid) DO UPDATE SET name = excluded.name, last_seen = datetime('now')`,
      [player.playerGuid, player.playerName, player.serverUuid]
    );
    this.save();
  }

  batchInsertPlayers(players: PlayerRecord[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO a3st_players (guid, name, server_uuid, last_seen)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(guid) DO UPDATE SET name = excluded.name, last_seen = datetime('now')`
    );
    for (const p of players) {
      stmt.run([p.playerGuid, p.playerName, p.serverUuid]);
    }
    stmt.free();
    this.save();
  }

  getStats(serverUuid: string, sinceHours = 24): StatsRecord[] {
    const rows = this.db.exec(
      `SELECT server_uuid as serverUuid, player_count as playerCount,
              recorded_at as timestamp, server_fps as serverFps
       FROM a3st_statistics
       WHERE server_uuid = ?
         AND recorded_at >= datetime('now', ?)
       ORDER BY recorded_at ASC`,
      [serverUuid, `-${sinceHours} hours`]
    );
    return this.parseRows(rows);
  }

  getSummary(serverUuid: string): {
    avgPlayers: number;
    peakPlayers: number;
    totalEntries: number;
  } {
    const rows = this.db.exec(
      `SELECT AVG(player_count) as avgPlayers,
              MAX(player_count) as peakPlayers,
              COUNT(*) as totalEntries
       FROM a3st_statistics WHERE server_uuid = ?`,
      [serverUuid]
    );
    if (rows.length > 0 && rows[0].values.length > 0) {
      const v = rows[0].values[0];
      return {
        avgPlayers: (v[0] as number) ?? 0,
        peakPlayers: (v[1] as number) ?? 0,
        totalEntries: (v[2] as number) ?? 0,
      };
    }
    return { avgPlayers: 0, peakPlayers: 0, totalEntries: 0 };
  }

  close(): void {
    this.save();
    this.db.close();
  }

  private parseRows(rows: QueryExecResult[]): StatsRecord[] {
    if (rows.length === 0) return [];
    return rows[0].values.map((v: SqlJsValue[]) => ({
      serverUuid: v[0] as string,
      playerCount: v[1] as number,
      timestamp: v[2] as string,
      serverFps: v[3] as number | undefined,
    }));
  }
}
