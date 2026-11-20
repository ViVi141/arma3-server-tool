import * as fs from "node:fs";
import * as path from "node:path";
import type { MissionHeartbeat } from "../types/health.js";
import { HEALTH_MARKER } from "./mod.js";

function characterArray(text: string): string {
  const codes: unknown = JSON.parse(text);
  if (!Array.isArray(codes) || codes.length > 512 || !codes.every((v) => Number.isInteger(v) && v >= 32 && v <= 0x10ffff)) throw new Error("无效文本编码");
  return String.fromCodePoint(...codes as number[]);
}

export function parseHeartbeat(line: string, now: number): MissionHeartbeat | null {
  const start = line.indexOf(HEALTH_MARKER);
  if (start < 0 || line.length > 16384) return null;
  try {
    const parts = line.slice(start + HEALTH_MARKER.length).trim().replace(/"$/, "").split("|");
    if (parts.length !== 8) return null;
    const [epoch, sequence, uptime, missionTime, fps] = [parts[0], parts[1], parts[4], parts[5], parts[6]].map(Number);
    if (![epoch, sequence, uptime, missionTime, fps].every((v) => Number.isFinite(v) && v >= 0)) return null;
    if (!Number.isSafeInteger(sequence) || sequence < 1 || uptime < epoch || fps > 10000) return null;
    const utc: unknown = JSON.parse(parts[7]);
    if (!Array.isArray(utc) || utc.length !== 7 || !utc.every(Number.isInteger)) return null;
    const [year, month, day, hour, minute, second, ms] = utc as number[];
    if (year < 2000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 ||
      hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59 || ms < 0 || ms > 999) return null;
    const emitted = Date.UTC(year, month - 1, day, hour, minute, second, ms);
    if (new Date(emitted).getUTCDate() !== day) return null;
    if (!Number.isFinite(emitted) || emitted > now + 30000 || emitted < now - 90000) return null;
    const mission = characterArray(parts[2]);
    const world = characterArray(parts[3]);
    if (!mission || !world) return null;
    return { epoch, sequence, mission, world, uptimeSeconds: uptime, missionSeconds: missionTime,
      fps, emittedAt: new Date(emitted).toISOString(), receivedAt: new Date(now).toISOString() };
  } catch { return null; }
}

interface Cursor { identity: string; offset: number; anchor: Buffer; pending: Buffer; discardLine: boolean }
const LIMIT = 1024 * 1024;
function identity(stat: fs.Stats): string { return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`; }
function read(fd: number, start: number, length: number): Buffer {
  const bytes = Buffer.alloc(length);
  return bytes.subarray(0, fs.readSync(fd, bytes, 0, length, start));
}

/** 独立于日志 UI 的增量读取器；不完整行保留，接管时跳过全部已有证据。 */
export class HealthRptTail {
  private cursors = new Map<string, Cursor>();
  private active: string | null = null;
  private root: string;
  constructor(profileRoot: string, existingFiles: string[]) {
    this.root = path.resolve(profileRoot);
    for (const file of existingFiles) {
      try {
        const fd = fs.openSync(file, "r");
        try {
          const stat = fs.fstatSync(fd);
          const anchor = read(fd, Math.max(0, stat.size - 64), Math.min(64, stat.size));
          this.cursors.set(file, { identity: identity(stat), offset: stat.size, anchor, pending: Buffer.alloc(0),
            discardLine: stat.size > 0 && anchor.at(-1) !== 10 });
        } finally { fs.closeSync(fd); }
      } catch { /* 后续采样会报告读取失败 */ }
    }
  }

  read(file: string | null): { lines: string[]; reset: boolean } {
    if (!file) {
      const reset = this.active !== null;
      this.active = null;
      return { lines: [], reset };
    }
    const root = fs.realpathSync(this.root);
    const relative = path.relative(root, fs.realpathSync(file));
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("RPT 不属于此实例 profile");
    const fd = fs.openSync(file, "r");
    try {
      const stat = fs.fstatSync(fd);
      const id = identity(stat);
      let cursor = this.cursors.get(file);
      let reset = this.active !== `${file}:${id}`;
      this.active = `${file}:${id}`;
      if (cursor && (cursor.identity !== id || stat.size < cursor.offset ||
        !read(fd, Math.max(0, cursor.offset - cursor.anchor.length), cursor.anchor.length).equals(cursor.anchor))) {
        cursor = undefined;
        reset = true;
      }
      if (!cursor) cursor = { identity: id, offset: 0, anchor: Buffer.alloc(0), pending: Buffer.alloc(0), discardLine: false };
      if (stat.size - cursor.offset > LIMIT) {
        cursor.offset = stat.size - LIMIT;
        cursor.pending = Buffer.alloc(0);
        cursor.discardLine = true;
        reset = true;
      }
      const buffer = read(fd, cursor.offset, stat.size - cursor.offset);
      cursor.offset += buffer.length;
      cursor.anchor = read(fd, Math.max(0, cursor.offset - 64), Math.min(64, cursor.offset));
      let joined = Buffer.concat([cursor.pending, buffer]);
      if (cursor.discardLine) {
        const newline = joined.indexOf(10);
        if (newline >= 0) { joined = joined.subarray(newline + 1); cursor.discardLine = false; }
        else joined = Buffer.alloc(0);
      }
      const last = joined.lastIndexOf(10);
      const lines = last >= 0 ? joined.subarray(0, last).toString("utf8").split(/\r?\n/) : [];
      cursor.pending = last >= 0 ? joined.subarray(last + 1) : joined;
      if (cursor.pending.length > 16384) { cursor.pending = Buffer.alloc(0); cursor.discardLine = true; }
      this.cursors.set(file, cursor);
      // 文件轮转不能无限积累内存；只保留有限个文件的游标。
      if (this.cursors.size > 32) this.cursors.delete(this.cursors.keys().next().value!);
      return { lines, reset };
    } finally { fs.closeSync(fd); }
  }
}
