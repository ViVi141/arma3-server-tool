/** Parse SteamCMD workshop download console output for successes / failures. */

const SUCCESS_ITEM_PATTERN = /Success\.\s+Downloaded item\s+(\d+)/gi;
const TIMEOUT_ITEM_PATTERN = /ERROR!\s+Timeout downloading item\s+(\d+)/gi;
const FAILED_ITEM_PATTERN = /ERROR!\s+Download item\s+(\d+)\s+failed/gi;

export function parseWorkshopDownloadSuccessIds(output: string): number[] {
  return collectUniqueIds(output, SUCCESS_ITEM_PATTERN);
}

export function parseWorkshopDownloadFailureIds(output: string): number[] {
  const timedOut = collectUniqueIds(output, TIMEOUT_ITEM_PATTERN);
  const failed = collectUniqueIds(output, FAILED_ITEM_PATTERN);
  const merged = new Set<number>([...timedOut, ...failed]);
  return [...merged];
}

/** Requested IDs that never reported Success. */
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
