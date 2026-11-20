import initSqlJs, { type Database as SqlDb, type QueryExecResult, type SqlJsValue } from "sql.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { replaceFile } from "../util/replace-file.js";

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
  private closed = false;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  /** 合并高频写入：最多延迟 2s 落盘一次，close() 前强制 flush。 */
  private static readonly FLUSH_DELAY_MS = 2000;
  /** 统计明细默认保留 90 天，可用 A3ST_STATS_RETENTION_DAYS 覆盖。 */
  private static readonly DEFAULT_RETENTION_DAYS = 90;

  constructor(dbPath: string) {
    this.dbPath = path.join(dbPath, "a3st_statistics.db");
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });

    this.ready = this.init();
  }

  private async init(): Promise<void> {
    try {
      const SQL = await initSqlJs();
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new SQL.Database(buffer);
      } else {
        this.db = new SQL.Database();
      }
      this.ensureSchema();
      this.pruneOldStats();
      this.save();
    } catch (error) {
      console.error("Monitoring database init failed:", error);
      if (this.db) {
        return;
      }
      try {
        const SQL = await initSqlJs();
        this.db = new SQL.Database();
        this.ensureSchema();
      } catch (fallbackError) {
        console.error("Monitoring database fallback failed:", fallbackError);
      }
    }
  }

  private ensureSchema(): void {
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
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_players_server_time
        ON a3st_players(server_uuid, last_seen)
    `);
  }

  private retentionDays(): number {
    const raw = Number.parseInt(process.env.A3ST_STATS_RETENTION_DAYS ?? "", 10);
    if (!Number.isFinite(raw) || raw <= 0) {
      return MonitoringDb.DEFAULT_RETENTION_DAYS;
    }
    return Math.min(raw, 3650);
  }

  /** 按保留策略清理过期的统计明细，避免 SQLite 文件无限增长。 */
  private pruneOldStats(): void {
    try {
      this.db.run("DELETE FROM a3st_statistics WHERE recorded_at < datetime('now', ?)", [
        `-${this.retentionDays()} days`,
      ]);
    } catch (error) {
      console.error("Monitoring database prune failed:", error);
    }
  }

  /**
   * 标记数据已变更并安排一次延迟落盘。
   * sql.js 每次 export() 都会序列化整库，逐条写会让磁盘 IO 随库体积线性放大；
   * 这里合并 2s 内的多次写入，close() 时强制 flush 保证不丢数据。
   * 方法名保持为 save()，既有测试与调用方依赖该入口。
   */
  private save(): void {
    if (!this.db || this.closed) {
      return;
    }
    this.dirty = true;
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, MonitoringDb.FLUSH_DELAY_MS);
    this.flushTimer.unref?.();
  }

  /** 立即把内存数据库写入磁盘；失败时保留脏标记，等待下一次重试。 */
  private flush(): void {
    if (!this.db || !this.dirty) {
      return;
    }
    this.dirty = false;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const temp = this.dbPath + ".tmp";
      fs.writeFileSync(temp, buffer);
      replaceFile(temp, this.dbPath);
    } catch (error) {
      this.dirty = true;
      console.error("Monitoring database flush failed:", error);
    }
  }

  private cancelFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async waitReady(): Promise<void> {
    await this.ready;
  }

  recordStats(serverUuid: string, playerCount: number, fps?: number): void {
    if (!this.db || this.closed) {
      return;
    }
    this.db.run(
      "INSERT INTO a3st_statistics (server_uuid, player_count, server_fps) VALUES (?, ?, ?)",
      [serverUuid, playerCount, fps ?? null]
    );
    this.save();
  }

  recordPlayer(player: PlayerRecord): void {
    if (!this.db || this.closed) {
      return;
    }
    this.db.run(
      `INSERT INTO a3st_players (guid, name, server_uuid, last_seen)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(guid) DO UPDATE SET
         name = excluded.name,
         server_uuid = excluded.server_uuid,
         last_seen = datetime('now')`,
      [player.playerGuid, player.playerName, player.serverUuid]
    );
    this.save();
  }

  batchInsertPlayers(players: PlayerRecord[]): void {
    if (!this.db || this.closed || players.length === 0) {
      return;
    }
    this.db.run("BEGIN TRANSACTION");
    const stmt = this.db.prepare(
      `INSERT INTO a3st_players (guid, name, server_uuid, last_seen)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(guid) DO UPDATE SET
         name = excluded.name,
         server_uuid = excluded.server_uuid,
         last_seen = datetime('now')`
    );
    try {
      for (const p of players) {
        stmt.run([p.playerGuid, p.playerName, p.serverUuid]);
      }
      this.db.run("COMMIT");
    } catch (error) {
      try {
        this.db.run("ROLLBACK");
      } catch {
        /* ignore rollback error */
      }
      throw error;
    } finally {
      stmt.free();
    }
    this.save();
  }

  recordCollectionTick(
    serverUuid: string,
    playerCount: number,
    players: PlayerRecord[],
    fps?: number
  ): void {
    if (!this.db || this.closed) {
      return;
    }
    this.db.run("BEGIN TRANSACTION");
    try {
      this.db.run(
        "INSERT INTO a3st_statistics (server_uuid, player_count, server_fps) VALUES (?, ?, ?)",
        [serverUuid, playerCount, fps ?? null]
      );
      if (players.length > 0) {
        const stmt = this.db.prepare(
          `INSERT INTO a3st_players (guid, name, server_uuid, last_seen)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(guid) DO UPDATE SET
             name = excluded.name,
             server_uuid = excluded.server_uuid,
             last_seen = datetime('now')`
        );
        try {
          for (const p of players) {
            stmt.run([p.playerGuid, p.playerName, p.serverUuid]);
          }
        } finally {
          stmt.free();
        }
      }
      this.db.run("COMMIT");
    } catch (error) {
      try {
        this.db.run("ROLLBACK");
      } catch {
        /* ignore rollback error */
      }
      throw error;
    }
    this.save();
  }

  getSummary(serverUuid: string): {
    avgPlayers: number;
    peakPlayers: number;
    totalEntries: number;
  } {
    if (!this.db || this.closed) {
      return { avgPlayers: 0, peakPlayers: 0, totalEntries: 0 };
    }
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

  getStats(serverUuid: string, sinceHours = 24): StatsRecord[] {
    if (!this.db || this.closed) {
      return [];
    }
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

  listPlayers(serverUuid: string, limit = 200): PlayerRecord[] {
    if (!this.db || this.closed) {
      return [];
    }
    const rows = this.db.exec(
      `SELECT guid as playerGuid, name as playerName, server_uuid as serverUuid,
              last_seen as lastSeen
       FROM a3st_players
       WHERE server_uuid = ?
       ORDER BY last_seen DESC
       LIMIT ?`,
      [serverUuid, limit]
    );
    if (rows.length === 0) {
      return [];
    }
    return rows[0].values.map((v: SqlJsValue[]) => ({
      playerGuid: v[0] as string,
      playerName: v[1] as string,
      serverUuid: v[2] as string,
      lastSeen: v[3] as string,
    }));
  }

  close(): void {
    if (!this.db || this.closed) {
      return;
    }
    this.cancelFlushTimer();
    // 关闭前强制落盘，避免 2s 合并窗口内的数据丢失。
    this.flush();
    this.closed = true;
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
