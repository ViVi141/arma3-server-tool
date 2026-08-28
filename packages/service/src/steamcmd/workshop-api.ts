import { proxyFetch } from "./proxy-fetch.js";
import {
  type LocalModRef,
  formatUnixTime,
  readLocalUpdatedAtMs,
  resolveUpdateStatus,
  type WorkshopUpdateStatus,
} from "./workshop-update.js";

export interface SteamWorkshopModInfo {
  modId: number;
  title: string;
  description: string;
  fileSizeMb: string;
  selected: boolean;
  timeUpdated?: number;
  timeUpdatedLabel?: string;
  localUpdatedAt?: string;
  localUpdatedLabel?: string;
  updateStatus?: WorkshopUpdateStatus;
  source?: "api" | "html" | "fallback";
}

const PUBLISHED_FILE_DETAILS_URL =
  "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";

const WORKSHOP_FILE_DETAILS_URL =
  "https://steamcommunity.com/sharedfiles/filedetails/?id=";

const HTML_FETCH_CONCURRENCY = 3;

function buildFallbackDetails(ids: number[]): SteamWorkshopModInfo[] {
  const result: SteamWorkshopModInfo[] = [];
  for (const modId of ids) {
    result.push({
      modId,
      title: `Workshop ${modId}`,
      description: "无法从 Steam 加载详情，仍可继续下载。",
      fileSizeMb: "-",
      selected: true,
      source: "fallback",
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

function extractJsonNumber(json: string, fieldName: string): number {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*(\\d+)`, "i");
  const match = pattern.exec(json);
  if (!match) {
    return 0;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function formatFileSize(rawSize: string | number): string {
  const bytes = typeof rawSize === "number" ? rawSize : Number(rawSize);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "-";
  }
  const megabytes = bytes / 1024 / 1024;
  return `${Math.round(megabytes * 100) / 100} MB`;
}

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findModSegment(html: string, modId: number): string {
  const idToken = `"publishedfileid":"${modId}"`;
  const idTokenAlt = `"publishedfileid": "${modId}"`;
  const idTokenNum = `"publishedfileid":${modId}`;
  let index = html.indexOf(idToken);
  if (index < 0) {
    index = html.indexOf(idTokenAlt);
  }
  if (index < 0) {
    index = html.indexOf(idTokenNum);
  }
  if (index < 0) {
    return html;
  }
  const start = Math.max(0, index - 400);
  const end = Math.min(html.length, index + 6000);
  return html.substring(start, end);
}

export function parseWorkshopFileDetailsHtml(html: string, modId: number): SteamWorkshopModInfo | null {
  if (!html.trim()) {
    return null;
  }

  const segment = findModSegment(html, modId);
  if (/creator_app_id/i.test(segment) && !/creator_app_id["\s:]*107410/i.test(segment)) {
    return null;
  }

  let title = extractJsonString(segment, "title");
  if (!title) {
    const titleMatch = html.match(/class="workshopItemTitle"[^>]*>([\s\S]*?)<\/div>/i);
    if (titleMatch) {
      title = stripHtml(titleMatch[1]);
    }
  }

  let description = extractJsonString(segment, "description");
  if (!description) {
    const descMatch = html.match(/class="workshopItemDescription"[^>]*>([\s\S]*?)<\/div>/i);
    if (descMatch) {
      description = stripHtml(descMatch[1]).slice(0, 500);
    }
  }

  const fileSizeRaw = extractJsonString(segment, "file_size");
  let fileSizeMb = formatFileSize(fileSizeRaw);
  if (fileSizeMb === "-") {
    const sizeMatch = html.match(/File Size[\s\S]{0,120}?detailsStatRight[^>]*>([^<]+)</i);
    if (sizeMatch) {
      fileSizeMb = stripHtml(sizeMatch[1]);
    }
  }

  const timeUpdated = extractJsonNumber(segment, "time_updated");
  const timeUpdatedLabel = formatUnixTime(timeUpdated);

  if (!title && timeUpdated <= 0 && fileSizeMb === "-") {
    return null;
  }

  return {
    modId,
    title: title || `Workshop ${modId}`,
    description,
    fileSizeMb,
    selected: true,
    timeUpdated: timeUpdated > 0 ? timeUpdated : undefined,
    timeUpdatedLabel: timeUpdated > 0 ? timeUpdatedLabel : undefined,
    source: "html",
  };
}

export function parseModDetails(json: string, requestedIds: number[]): SteamWorkshopModInfo[] {
  if (!json.trim()) {
    return buildFallbackDetails(requestedIds);
  }

  const result: SteamWorkshopModInfo[] = [];
  for (const modId of requestedIds) {
    const segment = findModSegment(json, modId);
    if (segment.includes("creator_app_id") && !segment.includes("107410")) {
      continue;
    }

    const title = extractJsonString(segment, "title");
    const timeUpdated = extractJsonNumber(segment, "time_updated");
    const info: SteamWorkshopModInfo = {
      modId,
      title: title || `Workshop ${modId}`,
      description: extractJsonString(segment, "description"),
      fileSizeMb: formatFileSize(extractJsonString(segment, "file_size")),
      selected: true,
      timeUpdated: timeUpdated > 0 ? timeUpdated : undefined,
      timeUpdatedLabel: timeUpdated > 0 ? formatUnixTime(timeUpdated) : undefined,
      source: "api",
    };
    result.push(info);
  }

  if (result.length === 0) {
    return buildFallbackDetails(requestedIds);
  }
  return result;
}

async function fetchWorkshopModDetailsFromApi(modIds: number[]): Promise<Map<number, SteamWorkshopModInfo>> {
  const result = new Map<number, SteamWorkshopModInfo>();
  if (!modIds.length) {
    return result;
  }

  const body = new URLSearchParams();
  body.set("itemcount", String(modIds.length));
  for (let i = 0; i < modIds.length; i++) {
    body.set(`publishedfileids[${i}]`, String(modIds[i]));
  }

  const response = await proxyFetch(PUBLISHED_FILE_DETAILS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    timeoutMs: 15000,
  });
  if (!response.ok) {
    return result;
  }
  const text = await response.text();
  for (const item of parseModDetails(text, modIds)) {
    if (item.source !== "fallback") {
      result.set(item.modId, item);
    }
  }
  return result;
}

async function fetchWorkshopModDetailsFromHtml(modId: number): Promise<SteamWorkshopModInfo | null> {
  const response = await proxyFetch(`${WORKSHOP_FILE_DETAILS_URL}${modId}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
    },
    timeoutMs: 20000,
  });
  if (!response.ok) {
    return null;
  }
  const html = await response.text();
  if (/Login\s+Store/i.test(html) && html.length < 5000) {
    return null;
  }
  return parseWorkshopFileDetailsHtml(html, modId);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current]);
    }
  }

  const workers: Promise<void>[] = [];
  const workerCount = Math.min(limit, items.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

function attachLocalUpdateInfo(
  mod: SteamWorkshopModInfo,
  local?: LocalModRef
): SteamWorkshopModInfo {
  const hasLocalPath = !!(local?.path && local.path.trim());
  const localUpdatedAtMs = readLocalUpdatedAtMs(local);
  const localUpdatedAt = localUpdatedAtMs ? new Date(localUpdatedAtMs).toISOString() : undefined;
  const updateStatus = resolveUpdateStatus(mod.timeUpdated, localUpdatedAtMs, hasLocalPath);
  return {
    ...mod,
    localUpdatedAt,
    localUpdatedLabel: localUpdatedAtMs ? formatUnixTime(localUpdatedAtMs / 1000) : undefined,
    updateStatus,
  };
}

export async function fetchWorkshopModDetails(
  modIds: number[],
  localMods: LocalModRef[] = []
): Promise<SteamWorkshopModInfo[]> {
  const ids = modIds.filter((id) => id > 0);
  if (!ids.length) {
    return [];
  }

  const localById = new Map<number, LocalModRef>();
  for (const item of localMods) {
    if (item.modId > 0) {
      localById.set(item.modId, item);
    }
  }

  const byId = await fetchWorkshopModDetailsFromApi(ids);
  const missing = ids.filter((id) => !byId.has(id));

  if (missing.length) {
    const htmlResults = await mapWithConcurrency(missing, HTML_FETCH_CONCURRENCY, async (modId) => {
      try {
        return await fetchWorkshopModDetailsFromHtml(modId);
      } catch {
        return null;
      }
    });
    for (const item of htmlResults) {
      if (item) {
        byId.set(item.modId, item);
      }
    }
  }

  const output: SteamWorkshopModInfo[] = [];
  for (const modId of ids) {
    const found = byId.get(modId);
    const base = found ?? buildFallbackDetails([modId])[0];
    output.push(attachLocalUpdateInfo(base, localById.get(modId)));
  }
  return output;
}
