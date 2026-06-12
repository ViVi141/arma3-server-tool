import type { FastifyInstance } from "fastify";
import type { ConfigStore } from "../config/store.js";
import type { ConfigSnapshotStore } from "../config/snapshot.js";
import type { ProcessManager } from "../process/manager.js";
import type { SteamCmdManager } from "../steamcmd/manager.js";
import type { ModScanner } from "../mods/scanner.js";
import type { MonitoringDb } from "../monitoring/db.js";
import type { Scheduler } from "../scheduling/cron.js";
import type { AsyncTaskManager } from "../task/manager.js";
import type { RptLogReader } from "../logs/reader.js";
import type { UiSettingsStore } from "../settings/ui-settings.js";
import type { ModScanPathStore } from "../mods/scan-path-store.js";
import type { SteamCmdSettingsStore } from "../settings/steamcmd-settings.js";

declare module "fastify" {
  interface FastifyInstance {
    configStore: ConfigStore;
    snapshotStore: ConfigSnapshotStore;
    processManager: ProcessManager;
    steamCmd: SteamCmdManager;
    modScanner: ModScanner;
    monitorDb: MonitoringDb;
    scheduler: Scheduler;
    rptLogReader: RptLogReader;
    uiSettingsStore: UiSettingsStore;
    modScanPathStore: ModScanPathStore;
    steamCmdSettingsStore: SteamCmdSettingsStore;
    asyncTaskManager: AsyncTaskManager;
    dataDir: string;
  }
  interface FastifyRequest {
    authenticated: boolean;
  }
}
