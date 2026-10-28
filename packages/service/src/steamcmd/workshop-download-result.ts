/** Parse SteamCMD workshop download console output for successes / failures. */

// SteamCMD reports a workshop item as satisfied in several phrasings depending
// on whether it freshly downloaded, found it current, or skipped re-download.
// Missing any of these made already-up-to-date mods look "not downloaded",
// which in turn triggered endless solo re-download retries (and login storms).
const SUCCESS_ITEM_PATTERNS: RegExp[] = [
  /Success\.\s+Downloaded item\s+(\d+)/gi,
  /Success\.\s+File\s+exists\s+up\s+to\s+date\s*\(?\s*(\d+)/gi,
  /Downloading item (\d+)[\s\S]*?Result: Success/gi,
  /Item (\d+) downloaded successfully/gi,
  /(\d+)\s*[:\-]\s*up[\s-]*to[\s-]*date/gi,
];

const TIMEOUT_ITEM_PATTERN = /ERROR!\s+Timeout downloading item\s+(\d+)/gi;
const FAILED_ITEM_PATTERN = /ERROR!\s+Download item\s+(\d+)\s+failed/gi;

export function parseWorkshopDownloadSuccessIds(output: string): number[] {
  const merged = new Set<number>();
  for (const pattern of SUCCESS_ITEM_PATTERNS) {
    for (const id of collectUniqueIds(output, pattern)) {
      merged.add(id);
    }
  }
  return [...merged];
}

export function parseWorkshopDownloadFailureIds(output: string): number[] {
  const timedOut = collectUniqueIds(output, TIMEOUT_ITEM_PATTERN);
  const failed = collectUniqueIds(output, FAILED_ITEM_PATTERN);
  const merged = new Set<number>([...timedOut, ...failed]);
  return [...merged];
}

/** Requested IDs that never reported Success / up-to-date. */
export function resolveWorkshopDownloadMissingIds(
  requestedIds: readonly number[],
  output: string,
): number[] {
  const succeeded = new Set(parseWorkshopDownloadSuccessIds(output));
  const missing: number[] = [];
  const seen = new Set<number>();

  for (const modId of requestedIds) {
    if (modId === 0 || seen.has(modId)) {
      continue;
    }
    seen.add(modId);
    // Anything not matched by a success/up-to-date marker is retried; explicit
    // timeout/failure lines never match success, so they fall through here too.
    if (!succeeded.has(modId)) {
      missing.push(modId);
    }
  }
  return missing;
}

export function hasWorkshopDownloadFailure(output: string): boolean {
  return parseWorkshopDownloadFailureIds(output).length > 0;
}

function collectUniqueIds(output: string, pattern: RegExp): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null = pattern.exec(output);
  while (match) {
    const id = parseInt(match[1], 10);
    if (id > 0 && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    match = pattern.exec(output);
  }
  return ids;
}
