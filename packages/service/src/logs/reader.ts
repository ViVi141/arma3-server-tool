import * as fs from "node:fs";
import * as path from "node:path";
import { decodeLogBytes } from "./decode.js";
import { CONFIG_FOLDER } from "../config/game-config-writer.js";

export type LogKind = "rpt" | "battleye" | "console";
export type LogKindFilter = LogKind | "all";

export interface RptLogEntry {
  fileName: string;
  filePath: string;
  size: number;
  lastModified: Date;
  kind: LogKind;
}

const BATTLEYE_EXCLUDED = new Set(["bans.txt", "beserver_x64.cfg", "beserver.cfg"]);

function profileSearchDirs(serverDir: string, serverUuid: string): string[] {
  if (!serverUuid) {
    return [serverDir];
  }
  return [
    serverDir,
    path.join(serverDir, CONFIG_FOLDER, serverUuid),
    path.join(serverDir, CONFIG_FOLDER, serverUuid, "Users", serverUuid),
  ];
}

function battleyeSearchDirs(serverDir: string, serverUuid: string): string[] {
  const dirs = [path.join(serverDir, "BattlEye")];
  if (serverUuid) {
    const profileRoot = path.join(serverDir, CONFIG_FOLDER, serverUuid);
    dirs.push(path.join(profileRoot, "BattlEye"));
    dirs.push(path.join(profileRoot, "Users", serverUuid, "BattlEye"));
  }
  return dirs;
}

export function isConsoleLogFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.startsWith("server_console") && lower.endsWith(".log")) {
    return true;
  }
  if (lower.startsWith("server_") && lower.endsWith(".log") && !lower.endsWith(".rpt")) {
    return true;
  }
  return false;
}

export function isRptLogFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".rpt");
}

function isBattlEyeLogFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (BATTLEYE_EXCLUDED.has(lower)) {
    return false;
  }
  if (lower.startsWith("beserver")) {
    return false;
  }
  return lower.endsWith(".log") || lower.endsWith(".txt");
}

function collectFiles(
  directory: string,
  kind: LogKind,
  results: RptLogEntry[],
  seen: Set<string>,
  fileFilter: (fileName: string) => boolean
): void {
  if (!fs.existsSync(directory)) {
    return;
  }
  for (const file of fs.readdirSync(directory)) {
    if (!fileFilter(file)) {
      continue;
    }
    const filePath = path.join(directory, file);
    let realPath = filePath;
    try {
      realPath = fs.realpathSync(filePath);
    } catch {
      continue;
    }
    if (seen.has(realPath)) {
      continue;
    }
    seen.add(realPath);
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        continue;
      }
      results.push({
        fileName: file,
        filePath,
        size: stat.size,
        lastModified: stat.mtime,
        kind,
      });
    } catch {
      // skip locked
    }
  }
}

export class RptLogReader {
  listLogs(
    serverDir: string,
    serverUuid: string,
    kind: LogKindFilter
  ): RptLogEntry[] {
    const results: RptLogEntry[] = [];
    if (!serverDir || !fs.existsSync(serverDir)) {
      return results;
    }

    const seen = new Set<string>();

    if (kind === "rpt" || kind === "all") {
      for (const dir of profileSearchDirs(serverDir, serverUuid)) {
        collectFiles(dir, "rpt", results, seen, isRptLogFileName);
      }
    }

    if (kind === "console" || kind === "all") {
      for (const dir of profileSearchDirs(serverDir, serverUuid)) {
        collectFiles(dir, "console", results, seen, isConsoleLogFileName);
      }
      collectFiles(path.join(serverDir, "logs"), "console", results, seen, (fileName) => {
        const lower = fileName.toLowerCase();
        if (serverUuid && lower === `server_${serverUuid.toLowerCase()}.log`) {
          return true;
        }
        return isConsoleLogFileName(fileName);
      });
    }

    if (kind === "battleye" || kind === "all") {
      for (const dir of battleyeSearchDirs(serverDir, serverUuid)) {
        collectFiles(dir, "battleye", results, seen, isBattlEyeLogFileName);
      }
    }

    results.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    return results;
  }

  readLog(
    filePath: string,
    maxLines = 200,
    startOffset?: number
  ): { lines: string[]; totalLines: number; offset: number } {
    if (!fs.existsSync(filePath)) {
      return { lines: ["[文件不存在]"], totalLines: 0, offset: 0 };
    }

    let fd: number | null = null;
    try {
      fd = fs.openSync(filePath, "r");
      const size = fs.fstatSync(fd).size;

      // Incremental tail: read forward from a known byte offset (live-follow).
      if (startOffset != null && startOffset >= 0) {
        const start = Math.min(startOffset, size);
        const chunk = readForward(fd, start, size, maxLines);
        return chunk;
      }

      // Default: read only the tail bytes needed for `maxLines` lines, so a
      // several-hundred-MB RPT no longer freezes the request thread.
      return readTail(fd, size, maxLines);
    } catch {
      return { lines: ["[读取日志失败]"], totalLines: 0, offset: 0 };
    } finally {
      if (fd !== null) {
        try {
          fs.closeSync(fd);
        } catch {
          // ignore
        }
      }
    }
  }

  findActiveRpt(serverDir: string, serverUuid: string): string | null {
    const logs = this.listLogs(serverDir, serverUuid, "rpt");
    if (logs.length === 0) {
      return null;
    }
    return logs[0].filePath;
  }

  findActiveConsoleLog(serverDir: string, serverUuid: string): string | null {
    const logs = this.listLogs(serverDir, serverUuid, "console");
    if (logs.length === 0) {
      return null;
    }
    const preferred = logs.find((item) =>
      item.fileName.toLowerCase().startsWith("server_console")
    );
    if (preferred) {
      return preferred.filePath;
    }
    return logs[0].filePath;
  }

  resolveAllowedLogPath(
    serverDir: string,
    serverUuid: string,
    kind: LogKindFilter,
    fileName?: string
  ): string | null {
    const logs = this.listLogs(serverDir, serverUuid, kind);
    if (logs.length === 0) {
      return null;
    }
    if (!fileName) {
      return logs[0].filePath;
    }
    const normalized = path.normalize(fileName);
    const match = logs.find((item) => {
      if (item.fileName.toLowerCase() === fileName.toLowerCase()) {
        return true;
      }
      if (path.normalize(item.filePath) === normalized) {
        return true;
      }
      return path.basename(fileName).toLowerCase() === item.fileName.toLowerCase();
    });
    if (match) {
      return match.filePath;
    }
    return null;
  }
}

/** Hard cap on bytes pulled in a single forward (follow) read. */
const FORWARD_BYTE_CAP = 1_000_000;
/** Block size used when scanning backwards for the tail. */
const TAIL_BLOCK = 65_536;

function splitLines(text: string): string[] {
  // Drop a single trailing newline so we don't report a phantom empty line.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

/**
 * Read the last `maxLines` lines by scanning backwards in blocks, so huge RPT
 * files cost O(tail) instead of O(fileSize).
 */
function readTail(fd: number, size: number, maxLines: number): {
  lines: string[]; totalLines: number; offset: number;
} {
  if (size === 0) {
    return { lines: ["[文件为空]"], totalLines: 0, offset: 0 };
  }
  let pos = size;
  let newlineCount = 0;
  // Grow the window until we have enough newlines (or reach the start).
  while (pos > 0 && newlineCount <= maxLines) {
    const readLen = Math.min(TAIL_BLOCK, pos);
    pos -= readLen;
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, pos);
    newlineCount += countNewlines(buf);
  }
  // Read the final collected region once, decoded as a whole (BOM-safe).
  const regionLen = size - pos;
  const buf = Buffer.alloc(regionLen);
  fs.readSync(fd, buf, 0, regionLen, pos);
  let lines = splitLines(decodeLogBytes(buf));
  if (pos > 0 && lines.length > 0) {
    // First line is likely truncated mid-line; drop it.
    lines = lines.slice(1);
  }
  if (lines.length > maxLines) {
    lines = lines.slice(lines.length - maxLines);
  }
  return {
    lines: lines.length > 0 ? lines : ["[文件为空]"],
    totalLines: lines.length,
    offset: size,
  };
}

/** Read forward from a byte offset (live-follow), capped to avoid full reads. */
function readForward(fd: number, start: number, size: number, maxLines: number): {
  lines: string[]; totalLines: number; offset: number;
} {
  if (start >= size) {
    return { lines: [], totalLines: 0, offset: start };
  }
  const want = Math.min(size - start, FORWARD_BYTE_CAP);
  const buf = Buffer.alloc(want);
  fs.readSync(fd, buf, 0, want, start);

  // Byte-level line boundaries (0x0A never appears inside GBK/UTF-8 trail
  // bytes) so the returned offset is exact for any encoding.
  const lineEnds: number[] = [];
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0x0a) {
      lineEnds.push(i + 1);
    }
  }

  let consumedBytes: number;
  if (lineEnds.length >= maxLines) {
    consumedBytes = lineEnds[maxLines - 1];
  } else if (want < size - start) {
    // Capped mid-file: stop at the last complete line so the next poll does
    // not re-send a half line.
    consumedBytes = lineEnds.length > 0 ? lineEnds[lineEnds.length - 1] : 0;
    if (consumedBytes === 0) {
      // A single line exceeds the cap; emit it truncated once and move on.
      consumedBytes = want;
    }
  } else {
    consumedBytes = want;
  }

  const lines = splitLines(decodeLogBytes(buf.subarray(0, consumedBytes)));
  return {
    lines,
    totalLines: lines.length,
    offset: start + consumedBytes,
  };
}

function countNewlines(buf: Buffer): number {
  let count = 0;
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0x0a) {
      count += 1;
    }
  }
  return count;
}
