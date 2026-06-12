import * as fs from "node:fs";
import * as path from "node:path";

export interface ModScanPathEntry {
  modulePath: string;
  prefix?: string;
  remark?: string;
}

export class ModScanPathStore {
  private filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "moduleScanPath.json");
  }

  list(): ModScanPathEntry[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as ModScanPathEntry[];
      if (Array.isArray(raw)) {
        return raw;
      }
      return [];
    } catch {
      return [];
    }
  }

  save(entries: ModScanPathEntry[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2), "utf-8");
  }
}
