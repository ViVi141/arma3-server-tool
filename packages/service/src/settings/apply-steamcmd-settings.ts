import type { SteamCmdManager } from "../steamcmd/manager.js";
import type { SteamCmdSettings } from "./steamcmd-settings.js";

export function applySteamCmdSettings(steamCmd: SteamCmdManager, settings: SteamCmdSettings): void {
  steamCmd.setWorkshopRoot(settings.workshopRoot);
  steamCmd.setServerInstallPath(settings.serverInstallPath);
  if (settings.username && settings.password) {
    steamCmd.setCredentials(settings.username, settings.password);
  }
}
