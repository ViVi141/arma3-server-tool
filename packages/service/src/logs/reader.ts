import * as fs from "node:fs";
import * as path from "node:path";
import { CONFIG_FOLDER } from "../config/game-config-writer.js";

export interface RptLogEntry {
  fileName: string;
  filePath: string;
  size: number;
  lastModified: Date;
  kind: "rpt" | "battleye";
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

function isRptLogFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".rpt")) {
    return true;
  }
  if (lower.startsWith("server_console") && lower.endsWith(".log")) {
    return true;
  }
  if (lower.startsWith("server_") && lower.endsWith(".log")) {
    return true;
  }
  return false;
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
  kind: "rpt" | "battleye",
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
    kind: "rpt" | "battleye" | "all"
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
      collectFiles(path.join(serverDir, "logs"), "rpt", results, seen, (fileName) => {
        const lower = fileName.toLowerCase();
        if (serverUuid && lower === `server_${serverUuid.toLowerCase()}.log`) {
          return true;
        }
        return lower.startsWith("server_") && lower.endsWith(".log");
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

    const content = fs.readFileSync(filePath, "utf-8");
    const allLines = content.split("\n");
    const total = allLines.length;

    let start = 0;
    if (startOffset != null) {
      start = Math.max(0, startOffset);
    } else if (total > maxLines) {
      start = total - maxLines;
    }

    const lines = allLines.slice(start, start + maxLines);

    return {
      lines: lines.length > 0 ? lines : ["[文件为空]"],
      totalLines: total,
      offset: start + lines.length,
    };
  }

  findActiveRpt(serverDir: string, serverUuid: string): string | null {
    const logs = this.listLogs(serverDir, serverUuid, "rpt");
    if (logs.length === 0) {
      return null;
    }
    const rptFile = logs.find((item) => item.fileName.toLowerCase().endsWith(".rpt"));
    if (rptFile) {
      return rptFile.filePath;
    }
    return logs[0].filePath;
  }

  resolveAllowedLogPath(
    serverDir: string,
    serverUuid: string,
    kind: "rpt" | "battleye" | "all",
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
