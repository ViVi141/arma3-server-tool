export interface SteamWorkshopModInfo {
  modId: number;
  title: string;
  description: string;
  fileSizeMb: string;
  selected: boolean;
}

const PUBLISHED_FILE_DETAILS_URL =
  "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";

function buildFallbackDetails(ids: number[]): SteamWorkshopModInfo[] {
  const result: SteamWorkshopModInfo[] = [];
  for (const modId of ids) {
    result.push({
      modId,
      title: `Workshop ${modId}`,
      description: "无法从 Steam API 加载详情，仍可继续下载。",
      fileSizeMb: "-",
      selected: true,
    });
  }
  return result;
}

function unescapeJson(value: string): string {
  if (!value) {
    return "";
  }
  return value
    .replace(/\\"/g, "\"")
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ");
}

function extractJsonString(json: string, fieldName: string): string {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"((?:\\\\.|[^\\\\"])*)"`, "i");
  const match = pattern.exec(json);
  if (!match) {
    return "";
  }
  return unescapeJson(match[1]);
}

function formatFileSize(rawSize: string): string {
  const bytes = Number(rawSize);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "-";
  }
  const megabytes = bytes / 1024 / 1024;
  return `${Math.round(megabytes * 100) / 100} MB`;
}

export function parseModDetails(json: string, requestedIds: number[]): SteamWorkshopModInfo[] {
  if (!json.trim()) {
    return buildFallbackDetails(requestedIds);
  }

  const result: SteamWorkshopModInfo[] = [];
  for (const modId of requestedIds) {
    const idToken = `"publishedfileid": "${modId}"`;
    const idTokenAlt = `"publishedfileid":${modId}`;
    let index = json.indexOf(idToken);
    if (index < 0) {
      index = json.indexOf(idTokenAlt);
    }
    if (index < 0) {
      continue;
    }

    const start = Math.max(0, index - 200);
    const length = Math.min(json.length - start, 4000);
    const segment = json.substring(start, start + length);
    if (segment.includes("creator_app_id") && !segment.includes("107410")) {
      continue;
    }

    const title = extractJsonString(segment, "title");
    const info: SteamWorkshopModInfo = {
      modId,
      title: title || `Workshop ${modId}`,
      description: extractJsonString(segment, "description"),
      fileSizeMb: formatFileSize(extractJsonString(segment, "file_size")),
      selected: true,
    };
    result.push(info);
  }

  if (result.length === 0) {
    return buildFallbackDetails(requestedIds);
  }
  return result;
}

export async function fetchWorkshopModDetails(modIds: number[]): Promise<SteamWorkshopModInfo[]> {
  const ids = modIds.filter((id) => id > 0);
  if (!ids.length) {
    return [];
  }

  try {
    const body = new URLSearchParams();
    body.set("itemcount", String(ids.length));
    for (let i = 0; i < ids.length; i++) {
      body.set(`publishedfileids[${i}]`, String(ids[i]));
    }

    const response = await fetch(PUBLISHED_FILE_DETAILS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return buildFallbackDetails(ids);
    }
    const text = await response.text();
    return parseModDetails(text, ids);
  } catch {
    return buildFallbackDetails(ids);
  }
}
