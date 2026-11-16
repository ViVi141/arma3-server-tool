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
  steamCmd.setLoginMode(settings.loginMode);
  if (settings.username) {
    // cached 模式允许无密码；password 模式仍写入（可能为空，由 requireCredentials 校验）
    steamCmd.setCredentials(settings.username, settings.password ?? "");
  }
}
