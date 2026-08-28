import type { SteamCmdManager } from "../steamcmd/manager.js";
import { resolveWorkshopRootForDownload } from "../steamcmd/path-helper.js";
import type { SteamCmdSettings } from "./steamcmd-settings.js";

export function applySteamCmdSettings(
  steamCmd: SteamCmdManager,
  settings: SteamCmdSettings,
  scanPaths: readonly string[] = [],
): void {
  const workshopRoot = resolveWorkshopRootForDownload(
    steamCmd.pathContext,
    settings.workshopRoot,
    scanPaths,
  );
  steamCmd.setWorkshopRoot(workshopRoot);
  steamCmd.setServerInstallPath(settings.serverInstallPath);
  if (settings.username && settings.password) {
    steamCmd.setCredentials(settings.username, settings.password);
  }
}
