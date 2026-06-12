import * as fs from "node:fs";
import * as path from "node:path";

export interface RptLogEntry {
  fileName: string;
  filePath: string;
  size: number;
  lastModified: Date;
  kind: "rpt" | "battleye";
}

const SERVER_CONFIG_FOLDER = "serverConfig";

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

    const searchDirs: { dir: string; kind: "rpt" | "battleye" }[] = [];
    if (kind === "rpt" || kind === "all") {
      searchDirs.push({ dir: serverDir, kind: "rpt" });
      searchDirs.push({
        dir: path.join(serverDir, SERVER_CONFIG_FOLDER, serverUuid, "Users", serverUuid),
        kind: "rpt",
      });
    }
    if (kind === "battleye" || kind === "all") {
      searchDirs.push({ dir: path.join(serverDir, "BattlEye"), kind: "battleye" });
      searchDirs.push({
        dir: path.join(serverDir, SERVER_CONFIG_FOLDER, serverUuid, "BattlEye"),
        kind: "battleye",
      });
    }

    const seen = new Set<string>();
    for (const item of searchDirs) {
      if (!fs.existsSync(item.dir)) {
        continue;
      }
      for (const file of fs.readdirSync(item.dir)) {
        const lower = file.toLowerCase();
        if (item.kind === "rpt" && !lower.endsWith(".rpt")) {
          continue;
        }
        if (item.kind === "battleye") {
          if (lower === "bans.txt" || lower.startsWith("beserver")) {
            continue;
          }
          if (!lower.endsWith(".log") && !lower.endsWith(".txt")) {
            continue;
          }
        }
        const filePath = path.join(item.dir, file);
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
            kind: item.kind,
          });
        } catch {
          // skip locked
        }
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
    const match = logs.find((item) => item.fileName.toLowerCase() === fileName.toLowerCase());
    if (match) {
      return match.filePath;
    }
    return null;
  }
}
