import { normalizeModScanPathEntries, resolveWorkshopInstallRootFromScanPaths } from "../../mods/paths.js";
import { applySteamCmdSettings } from "../../settings/apply-steamcmd-settings.js";
import type { ModScanPathEntry } from "../../mods/scan-path-store.js";
import type { UiSettings } from "../../settings/ui-settings.js";
import type { FastifyInstance } from "fastify";
import { envelope } from "./shared.js";

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get("/settings/ui", async () => {
    return envelope(true, app.uiSettingsStore.load(), null, "");
  });

  app.put("/settings/ui", async (req, reply) => {
    const body = req.body as Partial<UiSettings>;
    const current = app.uiSettingsStore.load();
    const merged: UiSettings = {
      showAdvancedSettings: body.showAdvancedSettings ?? current.showAdvancedSettings,
      allowExternalConfigRefresh: body.allowExternalConfigRefresh ?? current.allowExternalConfigRefresh,
      hasShownTrayMinimizeHint: body.hasShownTrayMinimizeHint ?? current.hasShownTrayMinimizeHint,
      autoSnapshotMode: body.autoSnapshotMode ?? current.autoSnapshotMode,
      autoSnapshotAsync: body.autoSnapshotAsync ?? current.autoSnapshotAsync,
    };
    app.uiSettingsStore.save(merged);
    return envelope(true, merged, null, "");
  });

  app.get("/settings/mod-scan-paths", async () => {
    return envelope(true, { paths: app.modScanPathStore.list() }, null, "");
  });

  app.put("/settings/mod-scan-paths", async (req, reply) => {
    const body = req.body as { paths?: ModScanPathEntry[] } | null;
    if (!body?.paths || !Array.isArray(body.paths)) {
      reply.status(400);
      return envelope(false, null, "INVALID_PATHS", "");
    }
    const normalizedPaths = normalizeModScanPathEntries(body.paths);
    app.modScanPathStore.save(normalizedPaths);
    const scanPaths = normalizedPaths.map((entry) => entry.modulePath).filter(Boolean);
    const current = app.steamCmdSettingsStore.load();
    let settings = current;
    if (!current.workshopRoot.trim()) {
      const derivedRoot = resolveWorkshopInstallRootFromScanPaths(scanPaths);
      if (derivedRoot) {
        settings = app.steamCmdSettingsStore.merge({ workshopRoot: derivedRoot });
      }
    }
    applySteamCmdSettings(app.steamCmd, settings, scanPaths);
    return envelope(true, { paths: normalizedPaths, message: "模组扫描路径已保存" }, null, "");
  });
}
