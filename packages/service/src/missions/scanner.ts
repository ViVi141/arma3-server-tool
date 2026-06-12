import * as fs from "node:fs";
import * as path from "node:path";
import type { MissionEntry } from "../types/config.js";

export function listMissionFiles(serverDir: string): string[] {
  const missionsDir = path.join(serverDir, "MPMissions");
  if (!fs.existsSync(missionsDir)) {
    return [];
  }

  const results: string[] = [];
  for (const file of fs.readdirSync(missionsDir)) {
    if (file.toLowerCase().endsWith(".pbo")) {
      results.push(file);
    }
  }
  results.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return results;
}

export function mergeMissionEntries(
  scannedTemplates: string[],
  savedMissions: MissionEntry[] = []
): MissionEntry[] {
  const savedByTemplate = new Map<string, MissionEntry>();
  for (const entry of savedMissions) {
    if (entry.template) {
      savedByTemplate.set(entry.template.toLowerCase(), entry);
    }
  }

  const merged: MissionEntry[] = [];
  for (const template of scannedTemplates) {
    const saved = savedByTemplate.get(template.toLowerCase());
    if (saved) {
      merged.push({
        template,
        difficulty: saved.difficulty ?? 3,
        whiteList: saved.whiteList ?? false,
        choose: saved.choose ?? false,
      });
      continue;
    }
    merged.push({
      template,
      difficulty: 3,
      whiteList: false,
      choose: false,
    });
  }
  return merged;
}
