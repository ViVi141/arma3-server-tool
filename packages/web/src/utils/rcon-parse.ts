export interface ParsedRconBan {
  id: number;
  guid: string;
  ip: string;
  duration: string;
  reason: string;
}

export interface ParsedRconMission {
  map: string;
  mission: string;
}

export function parseRconBans(raw: string): ParsedRconBan[] {
  const bans: ParsedRconBan[] = [];
  const lines = raw.split(/\r?\n/);
  let index = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (/^guid/i.test(trimmed) || /^id\s/i.test(trimmed)) {
      continue;
    }

    const numbered = trimmed.match(/^(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/);
    if (numbered) {
      index += 1;
      bans.push({
        id: parseInt(numbered[1], 10),
        guid: numbered[2],
        ip: "",
        duration: numbered[3],
        reason: numbered[4].trim(),
      });
      continue;
    }

    const parts = trimmed.split(/\s+/);
    if (parts.length >= 3) {
      index += 1;
      bans.push({
        id: index,
        guid: parts[0],
        ip: parts[1].includes(".") ? parts[1] : "",
        duration: parts[1].includes(".") ? parts[2] : parts[1],
        reason: parts.slice(parts[1].includes(".") ? 3 : 2).join(" "),
      });
    }
  }

  return bans;
}

export function parseRconMissions(raw: string): ParsedRconMission[] {
  const missions: ParsedRconMission[] = [];
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (/^missions/i.test(trimmed) || /^active/i.test(trimmed)) {
      continue;
    }

    const bracket = trimmed.match(/^\[\d+\]\s+(.+)$/);
    if (bracket) {
      const name = bracket[1].trim();
      const slash = name.indexOf("/");
      if (slash >= 0) {
        missions.push({ map: name.slice(0, slash), mission: name.slice(slash + 1) });
      } else {
        missions.push({ map: name, mission: name });
      }
      continue;
    }

    if (trimmed.endsWith(".pbo") || trimmed.includes(".")) {
      missions.push({ map: trimmed, mission: trimmed });
    }
  }

  return missions;
}
