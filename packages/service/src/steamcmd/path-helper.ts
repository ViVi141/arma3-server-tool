import * as path from "node:path";
import { resolveWorkshopInstallRootFromScanPath } from "../mods/paths.js";
import { resolveConfiguredPath } from "../util/user-path.js";

/** Mirrors legacy IAppPaths fields used by SteamCmdPathHelper / SteamCmdBootstrapper. */
export interface SteamCmdPathContext {
  applicationBase: string;
  userDataDirectory: string;
}

/** Same as SteamCmdBootstrapper.GetBundledDirectory. */
export function getBundledDirectory(userDataDirectory: string): string {
  return path.join(userDataDirectory, "extension");
}

/** 优先使用已配置的 Workshop 根；未配置时从模组扫描路径推导；仍无则回落到内置 extension 目录。 */
export function resolveWorkshopRootForDownload(
  ctx: SteamCmdPathContext,
  configuredWorkshopRoot: string,
  scanPaths: readonly string[],
): string {
  if (configuredWorkshopRoot.trim()) {
    return normalizeWorkshopRoot(ctx, configuredWorkshopRoot);
  }

  for (const scanPath of scanPaths) {
    const derived = resolveWorkshopInstallRootFromScanPath(scanPath);
    if (derived) {
      return normalizeWorkshopRoot(ctx, derived);
    }
  }

  return normalizeWorkshopRoot(ctx, "");
}

/** Same as SteamCmdPathHelper.NormalizeWorkshopRoot. */
export function normalizeWorkshopRoot(
  ctx: SteamCmdPathContext,
  workshopRoot: string,
): string {
  const preferredExtensionDirectory = getBundledDirectory(ctx.userDataDirectory);
  if (!workshopRoot || !workshopRoot.trim()) {
    return preferredExtensionDirectory;
  }

  const fullWorkshopRoot = resolveConfiguredPath(workshopRoot);
  if (!fullWorkshopRoot) {
    return preferredExtensionDirectory;
  }
  if (isBlockedInstallDirectory(ctx, fullWorkshopRoot)) {
    return preferredExtensionDirectory;
  }

  return fullWorkshopRoot;
}

/** Same as SteamCmdPathHelper.IsBlockedInstallDirectory. */
export function isBlockedInstallDirectory(
  ctx: SteamCmdPathContext,
  candidatePath: string,
): boolean {
  if (!candidatePath || !candidatePath.trim()) {
    return false;
  }

  if (pathsEqual(ctx.applicationBase, ctx.userDataDirectory)) {
    return false;
  }

  return isUnderDirectory(candidatePath, ctx.applicationBase);
}

/** Same as SteamCmdPathHelper.IsUnderDirectory. */
export function isUnderDirectory(candidatePath: string, rootDirectory: string): boolean {
  if (!candidatePath || !candidatePath.trim() || !rootDirectory || !rootDirectory.trim()) {
    return false;
  }

  const normalizedCandidate = trimTrailingSeparators(path.resolve(candidatePath));
  const normalizedRoot = trimTrailingSeparators(path.resolve(rootDirectory));
  if (normalizedCandidate.toLowerCase() === normalizedRoot.toLowerCase()) {
    return true;
  }

  const prefix = normalizedRoot + path.sep;
  return normalizedCandidate.toLowerCase().startsWith(prefix.toLowerCase());
}

function pathsEqual(left: string, right: string): boolean {
  if (!left || !left.trim() || !right || !right.trim()) {
    return false;
  }
  return (
    trimTrailingSeparators(path.resolve(left)).toLowerCase()
    === trimTrailingSeparators(path.resolve(right)).toLowerCase()
  );
}

function trimTrailingSeparators(value: string): string {
  let result = value;
  while (result.endsWith(path.sep)) {
    result = result.slice(0, -1);
  }
  return result;
}
