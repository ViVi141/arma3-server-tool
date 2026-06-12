import * as fs from "node:fs";
import * as path from "node:path";

export interface LocalBanEntry {
  guid: string;
  time: string;
  reason: string;
  name?: string;
  ip?: string;
}

const SERVER_CONFIG_FOLDER = "serverConfig";

export function getBanFilePaths(serverDir: string, serverUuid: string): string[] {
  return [
    path.join(serverDir, "bans.txt"),
    path.join(serverDir, SERVER_CONFIG_FOLDER, serverUuid, "BattlEye", "bans.txt"),
    path.join(serverDir, SERVER_CONFIG_FOLDER, serverUuid, "Users", serverUuid, "bans.txt"),
  ];
}

export function loadLocalBans(serverDir: string, serverUuid: string): LocalBanEntry[] {
  const result: LocalBanEntry[] = [];
  const seen = new Set<string>();

  for (const filePath of getBanFilePaths(serverDir, serverUuid)) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      appendParsedBans(content, result, seen);
    } catch {
      // skip unreadable
    }
  }

  return result;
}

export function saveLocalBans(
  serverDir: string,
  serverUuid: string,
  bans: LocalBanEntry[]
): { success: boolean; message: string } {
  const lines: string[] = [];
  for (const ban of bans) {
    if (!ban.guid?.trim()) {
      continue;
    }
    let expiry = ban.time ?? "-1";
    if (expiry === "永久封禁") {
      expiry = "-1";
    }
    lines.push(`${ban.guid.trim()} ${expiry} ${ban.reason ?? ""}`.trimEnd());
  }
  const payload = lines.length > 0 ? `${lines.join("\r\n")}\r\n` : "";

  for (const filePath of getBanFilePaths(serverDir, serverUuid)) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, payload, "utf-8");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message: `保存封禁列表失败 [${filePath}]: ${message}` };
    }
  }

  return { success: true, message: "封禁列表已保存" };
}

function appendParsedBans(content: string, target: LocalBanEntry[], seen: Set<string>): void {
  if (!content) {
    return;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const parts = line.split(/\s+/);
    if (parts.length === 0 || !parts[0]) {
      continue;
    }
    const guid = parts[0];
    if (seen.has(guid.toLowerCase())) {
      continue;
    }
    seen.add(guid.toLowerCase());

    let expiry = parts.length > 1 ? parts[1] : "";
    if (expiry === "-1") {
      expiry = "永久封禁";
    }
    const reason = parts.length > 2 ? parts.slice(2).join(" ") : "";
    target.push({ guid, time: expiry, reason });
  }
}
