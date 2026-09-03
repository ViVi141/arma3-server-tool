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

export function normalizeMissionTemplate(template: string): string {
  return template.trim().replace(/\.pbo$/i, "");
}

/**
 * Put the given mission template at index 0 (Arma Mission1).
 * Existing entry is moved and de-duplicated; missing entry is inserted.
 */
export function promoteMissionToFront(
  missions: MissionEntry[],
  template: string,
  difficulty?: number
): MissionEntry[] {
  const key = normalizeMissionTemplate(template).toLowerCase();
  if (!key) {
    return missions.slice();
  }

  let selected: MissionEntry | undefined;
  const rest: MissionEntry[] = [];
  for (const entry of missions) {
    const entryKey = normalizeMissionTemplate(entry.template ?? "").toLowerCase();
    if (entryKey === key) {
      if (!selected) {
        selected = { ...entry };
        if (difficulty !== undefined) {
          selected.difficulty = difficulty;
        }
      }
      continue;
    }
    rest.push(entry);
  }

  if (!selected) {
    const next: MissionEntry = {
      template: normalizeMissionTemplate(template),
      difficulty: 3,
    };
    if (difficulty !== undefined) {
      next.difficulty = difficulty;
    }
    selected = next;
  }

  return [selected, ...rest];
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
