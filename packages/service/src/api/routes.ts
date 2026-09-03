import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { RconClient } from "../rcon/index.js";
import type { ServerConfigPackage } from "../types/config.js";
import {
  writeAll,
  buildStartCommandLine,
  serverCfgExists,
  getServerExecutablePath,
  CONFIG_FOLDER,
} from "../config/game-config-writer.js";
import { runPreflightChecks } from "../preflight/checker.js";
import { fetchRconPlayers, resolveRconOptions, countOnlinePlayers } from "../rcon/helpers.js";
import { maybeAutoSnapshot } from "../config/auto-snapshot.js";
import { evaluateSyncState } from "../config/sync-state.js";
import { disableModsByScope, type ModDisableScope } from "../mods/enabler.js";
import { collectModPaths, ensureDefaultWorkshopScanPath, isModDirectory, normalizeModScanPathEntries, resolveWorkshopInstallRootFromScanPaths } from "../mods/paths.js";
import {
  buildModScanOptions,
  scanModsForConfig,
  syncRoleEntriesFromIds,
} from "../mods/mod-config-sync.js";
import { getServerKeysDirectory } from "../mods/bikey-service.js";
import type { LocalModEntry } from "../types/mods.js";
import { startHeadlessClient, stopHeadlessClient } from "../process/headless.js";
import type { UiSettings } from "../settings/ui-settings.js";
import type { ModScanPathEntry } from "../mods/scan-path-store.js";
import {
  toSteamCmdSettingsView,
} from "../settings/steamcmd-settings.js";
import { applySteamCmdSettings } from "../settings/apply-steamcmd-settings.js";
import { resolveConfiguredPath } from "../util/user-path.js";
import { fetchWorkshopModDetails } from "../steamcmd/workshop-api.js";
import { listMissionFiles, mergeMissionEntries, promoteMissionToFront } from "../missions/scanner.js";
import { loadLocalBans, saveLocalBans, type LocalBanEntry } from "../bans/bans-service.js";
import { runFullDiagnostics } from "../diagnostics/service.js";
import {
  deployMonitoringIfEnabled,
  hasBundledMonitoringAssets,
} from "../monitoring/deployment.js";
import { ingestMonitoringMessage } from "../monitoring/ingest.js";
import {
  buildDailyHtmlReport,
  buildPlayersCsv,
  buildStatsCsv,
} from "../monitoring/export.js";
import {
  detectRestartServer,
  executeCronAction,
  restartServer,
  startServer,
  stopServer,
} from "../scheduling/server-lifecycle.js";
import { syncCronJobsForServer } from "../scheduling/cron-sync.js";
import { validateServerPath } from "../utils/path-validation.js";
import { defaultServerExecutable } from "../platform/index.js";

export async function apiRoutes(app: FastifyInstance) {
  // ===================== Servers CRUD =====================

  app.get("/servers", async (req) => {
    const query = req.query as { reload?: string };
    const forceDisk = parseQueryBool(query.reload);
    if (forceDisk && app.uiSettingsStore.load().allowExternalConfigRefresh) {
      app.configStore.invalidateCache();
    }
    const servers = app.configStore.listServers();
    return servers.map((s) => {
      const config = app.configStore.load(s.uuid);
      const serverDir = config?.server?.serverDir;
      return {
        uuid: s.uuid,
        configName: s.configName,
        serverDir: serverDir ?? undefined,
      };
    });
  });

  app.get("/servers/:uuid/status", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    const state = app.processManager.getState(uuid, config ?? undefined);
    return {
      isRunning: state.isRunning,
      pid: state.pid,
      activeMissionTemplate: config?.tasks?.missions?.[0]?.template,
      serverModCount: config?.mods?.serverModIds?.length ?? 0,
    };
  });

  // Config read/write
  app.get("/servers/:uuid/config", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { reload?: string };
    const forceDisk =
      parseQueryBool(query.reload) && app.uiSettingsStore.load().allowExternalConfigRefresh;
    const config = app.configStore.load(uuid, { forceDisk });
    if (!config) {
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    return envelope(true, config, null, uuid);
  });

  app.put("/servers/:uuid/config", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const body = req.body as Record<string, unknown>;
    try {
      maybeAutoSnapshot(app, uuid, "save");
      app.configStore.save(uuid, body as never);
      return envelope(true, { message: "配置已保存" }, null, uuid);
    } catch {
      reply.status(400);
      return envelope(false, null, "SAVE_FAILED", uuid);
    }
  });

  app.patch("/servers/:uuid/config", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const existing = app.configStore.load(uuid);
    if (!existing) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const patch = req.body as Record<string, unknown>;
    const modsPatch = patch.mods;
    if (modsPatch && typeof modsPatch === "object" && !Array.isArray(modsPatch)) {
      const localMods = (modsPatch as { localMods?: unknown }).localMods;
      if (Array.isArray(localMods)) {
        for (const entry of localMods) {
          const pathVal = (entry as LocalModEntry).path;
          if (pathVal && !isModDirectory(pathVal)) {
            reply.status(400);
            return envelope(
              false,
              { message: `所选目录不是有效模组目录（需包含 addons 文件夹）: ${pathVal}` },
              "INVALID_MOD_PATH",
              uuid
            );
          }
        }
      }
    }
    const merged = mergeConfigPackage(existing, patch);
    maybeAutoSnapshot(app, uuid, "save");
    app.configStore.save(uuid, merged);

    const query = req.query as { writeCfg?: string };
    if (parseQueryBool(query.writeCfg)) {
      maybeAutoSnapshot(app, uuid, "write");
      const writeResult = writeAll(uuid, merged);
      if (!writeResult.success) {
        reply.status(400);
        return envelope(false, { message: writeResult.message }, "WRITE_CFG_FAILED", uuid);
      }
      return envelope(
        true,
        { message: `配置已更新。${writeResult.message}` },
        null,
        uuid
      );
    }

    return envelope(true, { message: "配置已更新" }, null, uuid);
  });

  app.get("/servers/:uuid/sync-state", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const syncState = evaluateSyncState(app.dataDir, uuid, config);
    return envelope(true, syncState, null, uuid);
  });

  // Create / clone / delete / rename
  app.post("/servers", async (req, reply) => {
    const body = req.body as { configName?: string; serverDir?: string } | null;
    const uuid = randomUUID();
    const configName = body?.configName?.trim() || uuid;
    const serverDir = body?.serverDir?.trim() ?? "";
    const initialConfig: ServerConfigPackage = {
      formatVersion: 2,
      server: {
        configName,
        serverDir,
        executable: defaultServerExecutable(),
      },
    };
    app.configStore.save(uuid, initialConfig, configName);
    reply.status(201);
    return envelope(true, { uuid }, null, uuid);
  });

  app.post("/servers/:uuid/clone", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const newUuid = randomUUID();
    app.configStore.save(newUuid, config);
    reply.status(201);
    return envelope(true, { uuid: newUuid }, null, uuid);
  });

  app.delete("/servers/:uuid", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const ok = app.configStore.delete(uuid);
    if (!ok) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    return envelope(true, { message: "已删除" }, null, uuid);
  });

  app.put("/servers/:uuid/rename", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const body = req.body as { newName?: string } | null;
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    app.configStore.save(uuid, config, body?.newName);
    return envelope(true, { message: "已重命名" }, null, uuid);
  });

  // ===================== SteamCMD =====================

  app.get("/settings/steamcmd", async () => {
    const settings = app.steamCmdSettingsStore.load();
    const view = toSteamCmdSettingsView(settings, app.steamCmd.steamCmdDir);
    return envelope(true, view, null, "");
  });

  app.post("/workshop/mod-details", async (req, reply) => {
    const body = req.body as { modIds?: number[]; localMods?: { modId: number; path?: string; updatedAt?: string }[] } | null;
    const modIds = body?.modIds ?? [];
    if (!modIds.length) {
      reply.status(400);
      return envelope(false, null, "INVALID_BODY", "");
    }
    const mods = await fetchWorkshopModDetails(modIds, body?.localMods ?? []);
    return envelope(true, { mods }, null, "");
  });

  app.put("/settings/steamcmd", async (req, reply) => {
    const body = req.body as {
      username?: string;
      password?: string;
      workshopRoot?: string;
      serverInstallPath?: string;
    } | null;
    if (!body) {
      reply.status(400);
      return envelope(false, null, "INVALID_BODY", "");
    }
    const merged = app.steamCmdSettingsStore.merge({
      username: body.username,
      password: body.password,
      workshopRoot: body.workshopRoot !== undefined
        ? (body.workshopRoot.trim() ? resolveConfiguredPath(body.workshopRoot) : "")
        : undefined,
      serverInstallPath: body.serverInstallPath !== undefined
        ? (body.serverInstallPath.trim() ? resolveConfiguredPath(body.serverInstallPath) : "")
        : undefined,
    });
    applySteamCmdSettings(
      app.steamCmd,
      merged,
      app.modScanPathStore.list().map((entry) => entry.modulePath),
    );
    if (merged.workshopRoot.trim()) {
      ensureDefaultWorkshopScanPath(app.modScanPathStore, merged.workshopRoot);
    }
    const view = toSteamCmdSettingsView(merged, app.steamCmd.steamCmdDir);
    return envelope(true, { message: "SteamCMD 设置已保存", ...view }, null, "");
  });

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

  app.get("/steamcmd/status", async () => {
    return envelope(true, {
      isRunning: app.steamCmd.isRunning,
      isInstalled: app.steamCmd.isInstalled,
    }, null, "");
  });

  app.put("/steamcmd/credentials", async (req, reply) => {
    const body = req.body as { username?: string; password?: string } | null;
    if (!body?.username || !body?.password) {
      reply.status(400);
      return envelope(false, null, "INVALID_CREDENTIALS", "");
    }
    app.steamCmd.setCredentials(body.username, body.password);
    const merged = app.steamCmdSettingsStore.merge({
      username: body.username,
      password: body.password,
    });
    applySteamCmdSettings(
      app.steamCmd,
      merged,
      app.modScanPathStore.list().map((entry) => entry.modulePath),
    );
    return envelope(true, { message: "凭据已设置" }, null, "");
  });

  app.get("/steamcmd/log", async (req) => {
    const query = req.query as { tail?: string };
    const maxLines = parseInt(query.tail ?? "300", 10);
    const text = await app.steamCmd.getLatestLog(maxLines);
    return envelope(true, { text, source: "aggregated" }, null, "");
  });

  app.post("/steamcmd/stop", async () => {
    app.steamCmd.kill();
    return envelope(true, { message: "SteamCMD 已停止" }, null, "");
  });

  // ===================== Preflight =====================

  app.get("/servers/:uuid/preflight", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      return envelope(false, null, "NOT_FOUND", uuid);
    }

    const state = app.processManager.getState(uuid, config ?? undefined);
    const modPaths = collectModPaths(app, config);
    const scannedMods = modPaths.length > 0
      ? scanModsForConfig(app, config)
      : [];

    const result = runPreflightChecks(uuid, config, {
      isRunning: state.isRunning,
      scannedMods,
    });

    return envelope(true, result, null, uuid);
  });

  app.get("/servers/:uuid/rcon/players", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    if (!resolveRconOptions(config)) {
      reply.status(400);
      return envelope(false, null, "RCON_NOT_CONFIGURED", uuid);
    }

    try {
      const players = await fetchRconPlayers(config);
      return envelope(true, { players, count: players.length }, null, uuid);
    } catch (error) {
      reply.status(502);
      const message = error instanceof Error ? error.message : "RCon 连接失败";
      return envelope(false, { message }, "RCON_FAILED", uuid);
    }
  });

  app.get("/servers/:uuid/mods", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }

    const modPaths = collectModPaths(app, config);
    const mods = scanModsForConfig(app, config);

    return envelope(true, { mods, scanPathCount: modPaths.length }, null, uuid);
  });

  app.get("/servers/:uuid/mods/bikeys", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }

    const summary = app.modScanner.summarizeBikeys(buildModScanOptions(app, config));

    return envelope(true, summary, null, uuid);
  });

  app.post("/mods/validate-path", async (req, reply) => {
    const body = req.body as { path?: string } | null;
    const modPath = body?.path?.trim() ?? "";
    if (!modPath) {
      reply.status(400);
      return envelope(false, null, "INVALID_BODY", "");
    }
    return envelope(true, { valid: isModDirectory(modPath) }, null, "");
  });

  app.get("/servers/:uuid/mods/bikeys/files", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config?.server?.serverDir) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const keysDir = getServerKeysDirectory(config.server.serverDir);
    const files: { name: string; size: number; fullPath: string }[] = [];
    if (fs.existsSync(keysDir)) {
      for (const file of fs.readdirSync(keysDir)) {
        if (!file.toLowerCase().endsWith(".bikey")) {
          continue;
        }
        const filePath = path.join(keysDir, file);
        try {
          const stat = fs.statSync(filePath);
          files.push({ name: file, size: stat.size, fullPath: filePath });
        } catch {
          // skip
        }
      }
    }
    return envelope(true, { keysDir, files }, null, uuid);
  });

  app.get("/servers/:uuid/missions/scan", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config?.server?.serverDir) {
      reply.status(400);
      return envelope(false, { message: "未设置服务器目录" }, "NO_SERVER_DIR", uuid);
    }
    const templates = listMissionFiles(config.server.serverDir);
    const missions = mergeMissionEntries(templates, config.tasks?.missions ?? []);
    return envelope(true, { missions, scanned: templates.length }, null, uuid);
  });

  app.get("/servers/:uuid/diagnostics", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const state = app.processManager.getState(uuid, config ?? undefined);
    const modPaths = collectModPaths(app, config);
    const scannedMods = modPaths.length > 0 ? scanModsForConfig(app, config) : [];
    const result = runFullDiagnostics(app, uuid, config, {
      isRunning: state.isRunning,
      scannedMods,
    });
    return envelope(true, result, null, uuid);
  });

  app.get("/servers/:uuid/paths", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const serverDir = config.server?.serverDir ?? "";
    return envelope(
      true,
      {
        toolConfigDir: app.configStore.getServerConfigDir(uuid),
        dataConfigDir: app.configStore.getConfigDir(),
        serverDir,
        serverConfigDir: serverDir
          ? path.join(serverDir, CONFIG_FOLDER, uuid)
          : "",
        logDir: serverDir
          ? path.join(serverDir, "logs")
          : "",
      },
      null,
      uuid
    );
  });

  app.get("/servers/:uuid/dashboard", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      return envelope(false, null, "NOT_FOUND", uuid);
    }

    const state = app.processManager.getState(uuid, config ?? undefined);
    const basic = (config.basic ?? {}) as Record<string, unknown>;
    const startup = (config.startup ?? {}) as Record<string, unknown>;
    const scheduler = (config.scheduler ?? {}) as Record<string, unknown>;

    let onlineCount: number | null = null;
    if (state.isRunning && config.battleye?.rconPassword) {
      onlineCount = await countOnlinePlayers(config);
    }

    const monitoring = app.monitorDb.getSummary(uuid);
    const latestRpt = config.server?.serverDir
      ? app.rptLogReader.listLogs(config.server.serverDir, uuid, "rpt")[0]?.fileName ?? null
      : null;

    return envelope(
      true,
      {
        hostname: (basic.hostname as string) ?? "-",
        port: startup.port ?? basic.port ?? "-",
        isRunning: state.isRunning,
        pid: state.pid,
        onlineCount,
        monitoring,
        scheduleSummary: scheduler.restartCron
          ? `重启: ${scheduler.restartCron}`
          : scheduler.monitoringCron
            ? `采集: ${scheduler.monitoringCron}`
            : "-",
        latestRpt,
        cfgWritten: config.server?.serverDir
          ? serverCfgExists(config.server.serverDir, uuid)
          : false,
      },
      null,
      uuid
    );
  });

  // ===================== Logs =====================

  app.get("/servers/:uuid/rpt", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config?.server?.serverDir) {
      return envelope(true, { lines: ["[未设置服务器目录]"], totalLines: 0 }, null, uuid);
    }
    const rptPath = app.rptLogReader.findActiveRpt(config.server.serverDir, uuid);
    if (!rptPath) {
      return envelope(true, { lines: ["[未找到 RPT 日志]"], totalLines: 0 }, null, uuid);
    }
    const result = app.rptLogReader.readLog(rptPath, 200);
    return envelope(true, result, null, uuid);
  });

  app.get("/servers/:uuid/logs", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { kind?: string };
    const config = app.configStore.load(uuid);
    if (!config?.server?.serverDir) {
      reply.status(400);
      return envelope(false, { message: "未设置服务器目录" }, "NO_SERVER_DIR", uuid);
    }
    const kind = (query.kind ?? "all") as "rpt" | "battleye" | "all";
    const files = app.rptLogReader.listLogs(config.server.serverDir, uuid, kind).map((item) => ({
      fileName: item.fileName,
      filePath: item.filePath,
      size: item.size,
      lastModified: item.lastModified.toISOString(),
      kind: item.kind,
    }));
    return envelope(
      true,
      { kind, serverDir: config.server.serverDir, files },
      null,
      uuid
    );
  });

  app.get("/servers/:uuid/logs/read", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { kind?: string; tail?: string; file?: string };
    const config = app.configStore.load(uuid);
    if (!config?.server?.serverDir) {
      reply.status(400);
      return envelope(false, { message: "未设置服务器目录" }, "NO_SERVER_DIR", uuid);
    }
    const kind = (query.kind ?? "rpt") as "rpt" | "battleye" | "all";
    const maxLines = parseInt(query.tail ?? "200", 10);
    const target = app.rptLogReader.resolveAllowedLogPath(
      config.server.serverDir,
      uuid,
      kind,
      query.file
    );
    if (!target) {
      return envelope(true, { lines: ["[无日志文件]"], totalLines: 0, fileName: "" }, null, uuid);
    }
    const result = app.rptLogReader.readLog(target, maxLines);
    return envelope(
      true,
      { ...result, fileName: path.basename(target), filePath: target },
      null,
      uuid
    );
  });

  // ===================== Monitoring =====================

  app.get("/servers/:uuid/monitoring/summary", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const summary = app.monitorDb.getSummary(uuid);
    return envelope(true, summary, null, uuid);
  });

  app.get("/servers/:uuid/monitoring/stats", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { hours?: string };
    const hours = parseInt(query.hours ?? "24", 10);
    const stats = app.monitorDb.getStats(uuid, hours);
    return envelope(true, { stats }, null, uuid);
  });

  app.get("/servers/:uuid/monitoring/players", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const players = app.monitorDb.listPlayers(uuid);
    return envelope(true, { players }, null, uuid);
  });

  app.post("/monitoring/collect", async () => {
    const servers = app.configStore.listServers();
    let count = 0;
    for (const s of servers) {
      const config = app.configStore.load(s.uuid);
      if (!config) {
        continue;
      }
      const state = app.processManager.getState(s.uuid, config);
      if (!state.isRunning) {
        continue;
      }
      let playerCount = 0;
      const online = await countOnlinePlayers(config);
      if (online !== null) {
        playerCount = online;
        const players = await fetchRconPlayers(config);
        for (const player of players) {
          if (player.guid) {
            app.monitorDb.recordPlayer({
              playerGuid: player.guid,
              playerName: player.name ?? player.guid,
              serverUuid: s.uuid,
              lastSeen: new Date().toISOString(),
            });
          }
        }
      }
      app.monitorDb.recordStats(s.uuid, playerCount);
      count++;
    }
    return envelope(true, { collected: count }, null, "");
  });

  app.post("/servers/:uuid/monitoring/ingest", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const body = req.body as { message?: string } | string | null;
    const message = typeof body === "string" ? body : body?.message;
    if (!message) {
      reply.status(400);
      return envelope(false, null, "INVALID_BODY", uuid);
    }
    ingestMonitoringMessage(app.monitorDb, uuid, message);
    return envelope(true, { message: "监控数据已入库" }, null, uuid);
  });

  app.post("/servers/:uuid/monitoring/sync-players", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const players = await fetchRconPlayers(config);
    for (const player of players) {
      if (player.guid) {
        app.monitorDb.recordPlayer({
          playerGuid: player.guid,
          playerName: player.name ?? player.guid,
          serverUuid: uuid,
          lastSeen: new Date().toISOString(),
        });
      }
    }
    return envelope(true, { synced: players.length }, null, uuid);
  });

  app.get("/servers/:uuid/monitoring/export/html", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const stats = app.monitorDb.getStats(uuid, 24);
    const manifest = app.configStore.listServers().find((item) => item.uuid === uuid);
    const html = buildDailyHtmlReport(manifest?.configName ?? uuid, uuid, stats);
    reply.header("Content-Type", "text/html; charset=utf-8");
    return envelope(true, { html }, null, uuid);
  });

  app.get("/servers/:uuid/monitoring/export/csv", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { kind?: string };
    const kind = query.kind ?? "stats";
    if (kind === "players") {
      const csv = buildPlayersCsv(app.monitorDb.listPlayers(uuid));
      reply.header("Content-Type", "text/csv; charset=utf-8");
      return envelope(true, { csv }, null, uuid);
    }
    const csv = buildStatsCsv(app.monitorDb.getStats(uuid, 24));
    reply.header("Content-Type", "text/csv; charset=utf-8");
    return envelope(true, { csv }, null, uuid);
  });

  app.get("/servers/:uuid/monitoring/assets", async (req) => {
    const { uuid } = req.params as { uuid: string };
    return envelope(
      true,
      { hasBundledAssets: hasBundledMonitoringAssets(app.dataDir) },
      null,
      uuid
    );
  });

  // ===================== Scheduled Tasks =====================

  app.get("/schedule", async () => {
    return envelope(true, { jobs: app.scheduler.list() }, null, "");
  });

  app.post("/schedule/restart", async (req) => {
    const body = req.body as { serverUuid?: string; cron?: string } | null;
    if (!body?.serverUuid || !body?.cron) {
      return envelope(false, null, "INVALID_REQUEST", "");
    }
    app.scheduler.add({
      name: `restart-${body.serverUuid}`,
      schedule: body.cron,
      handler: () => {
        app.processManager.kill(body.serverUuid!);
        setTimeout(() => {
          const config = app.configStore.load(body.serverUuid!);
          if (config?.server?.serverDir && serverCfgExists(config.server.serverDir, body.serverUuid!)) {
            const executable = getServerExecutablePath(config);
            const mods = scanModsForConfig(app, config);
            const commandLine = buildStartCommandLine(body.serverUuid!, config, mods);
            app.processManager.register(body.serverUuid!, {
              executable,
              commandLine,
              cwd: config.server.serverDir,
            });
            app.processManager.start(body.serverUuid!);
          }
        }, 5000);
      },
    });
    return envelope(true, { message: `定时重启已设置: ${body.cron}` }, null, "");
  });

  // ===================== Snapshots =====================

  app.get("/servers/:uuid/snapshots", async (req) => {
    const { uuid } = req.params as { uuid: string };
    return envelope(true, app.snapshotStore.list(uuid), null, uuid);
  });

  app.post("/servers/:uuid/snapshots", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const body = req.body as { label?: string } | null;
    try {
      const id = app.snapshotStore.create(uuid, body?.label ?? "手动备份");
      return envelope(true, { id, message: "快照已创建" }, null, uuid);
    } catch (e: unknown) {
      return envelope(false, null, "SNAPSHOT_FAILED", uuid);
    }
  });

  app.post("/servers/:uuid/snapshots/:snapshotId/restore", async (req) => {
    const { uuid, snapshotId } = req.params as { uuid: string; snapshotId: string };
    const ok = app.snapshotStore.restore(uuid, snapshotId);
    if (!ok) return envelope(false, null, "NOT_FOUND", uuid);
    app.configStore.invalidateCache(uuid);
    return envelope(true, { message: "快照已恢复" }, null, uuid);
  });

  // ===================== Bans =====================

  app.get("/servers/:uuid/bans", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config?.server?.serverDir) {
      reply.status(400);
      return envelope(false, { message: "未设置服务器目录" }, "NO_SERVER_DIR", uuid);
    }
    const bans = loadLocalBans(config.server.serverDir, uuid);
    return envelope(true, bans, null, uuid);
  });

  app.put("/servers/:uuid/bans", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config?.server?.serverDir) {
      reply.status(400);
      return envelope(false, { message: "未设置服务器目录" }, "NO_SERVER_DIR", uuid);
    }
    const body = req.body as LocalBanEntry[] | null;
    if (!Array.isArray(body)) {
      reply.status(400);
      return envelope(false, null, "INVALID_BAN", uuid);
    }
    const result = saveLocalBans(config.server.serverDir, uuid, body);
    if (!result.success) {
      reply.status(400);
      return envelope(false, { message: result.message }, "SAVE_BANS_FAILED", uuid);
    }
    return envelope(true, { message: result.message, count: body.length }, null, uuid);
  });

  app.get("/bans", async (req, reply) => {
    const query = req.query as { serverUuid?: string };
    if (!query.serverUuid) {
      reply.status(400);
      return envelope(false, { message: "请提供 serverUuid 参数" }, "MISSING_UUID", "");
    }
    const config = app.configStore.load(query.serverUuid);
    if (!config?.server?.serverDir) {
      reply.status(400);
      return envelope(false, { message: "未设置服务器目录" }, "NO_SERVER_DIR", query.serverUuid);
    }
    return envelope(true, loadLocalBans(config.server.serverDir, query.serverUuid), null, query.serverUuid);
  });

  app.post("/bans", async (req, reply) => {
    reply.status(400);
    return envelope(false, { message: "请使用 PUT /servers/:uuid/bans" }, "DEPRECATED", "");
  });

  app.delete("/bans/:guid", async (req, reply) => {
    const { guid } = req.params as { guid: string };
    reply.status(400);
    return envelope(false, { message: "请使用 PUT /servers/:uuid/bans" }, "DEPRECATED", guid);
  });

  // ===================== File Uploads =====================

  app.post("/servers/:uuid/files/mod-list-html", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { mode?: string; writeCfg?: string };
    let html = "";

    const contentType = req.headers["content-type"] ?? "";
    if (contentType.includes("multipart")) {
      const data = await req.file();
      if (data) {
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) chunks.push(chunk);
        html = Buffer.concat(chunks).toString("utf-8");
      }
    } else {
      html = req.body as string;
    }

    if (!html) {
      reply.status(400);
      return envelope(false, null, "NO_CONTENT", uuid);
    }

    // Parse IDs from HTML
    const ids = [...html.matchAll(/(\d{7,})/g)].map((m) => parseInt(m[1], 10));
    const mode = query.mode ?? "download_and_enable";
    const writeCfg = query.writeCfg === "true";

    const result = await executeCommand(app, uuid, {
      action: "import_mods_html",
      modIds: ids,
      writeCfgAfter: writeCfg,
    } as never);

    if (!result.success) {
      reply.status(400);
    }
    return envelope(result.success, {
      success: result.success,
      message: result.message,
      modCount: ids.length,
      requiresSteamCmd: true,
    }, result.success ? null : result.message, uuid);
  });

  app.post("/servers/:uuid/files/mission-pbo", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { addToMissionList?: string; writeCfg?: string };

    const config = app.configStore.load(uuid);
    if (!config?.server?.serverDir) {
      reply.status(400);
      return envelope(false, null, "NO_SERVER_DIR", uuid);
    }

    const data = await req.file();
    if (!data) {
      reply.status(400);
      return envelope(false, null, "NO_FILE", uuid);
    }

    const mpmDir = path.join(config.server.serverDir, "MPMissions");
    fs.mkdirSync(mpmDir, { recursive: true });

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const fullPath = path.join(mpmDir, data.filename);

    fs.writeFileSync(fullPath, Buffer.concat(chunks));

    if (query.addToMissionList === "true") {
      const template = path.basename(data.filename, path.extname(data.filename));
      const missions = config.tasks?.missions ?? [];
      if (!missions.some((m) => m.template === template)) {
        missions.push({ template, difficulty: 3 });
      }
      config.tasks = { ...config.tasks, missions };
      app.configStore.save(uuid, config);
    }

    return envelope(true, {
      template: path.basename(data.filename, ".pbo"),
      fullPath,
      fileName: data.filename,
    }, null, uuid);
  });

  // ===================== Task =====================

  app.post("/task", async (req, reply) => {
    const task = req.body as {
      taskId?: string;
      serverUuid?: string;
      serverName?: string;
      commands?: { action: string; [key: string]: unknown }[];
      async?: boolean;
      writeCfgAfter?: boolean;
      restartAfter?: boolean;
    };

    if (!task.serverUuid || !task.commands?.length) {
      reply.status(400);
      return envelope(false, null, "INVALID_TASK", task.serverUuid ?? "");
    }

    const uuid = task.serverUuid as string;
    const cmds = task.commands as { action: string; [key: string]: unknown }[];
    const taskDefaults = {
      writeCfgAfter: task.writeCfgAfter === true,
      restartAfter: task.restartAfter === true,
    };
    const executor = (cmd: { action: string; [key: string]: unknown }) =>
      executeCommandWithFollowUps(app, uuid, cmd, taskDefaults);

    if (task.async) {
      const taskId = await app.asyncTaskManager.runAsync(uuid, cmds, executor);
      return envelope(true, { taskId, status: "Running" }, null, uuid);
    }

    const result = await app.asyncTaskManager.runSync(uuid, cmds, executor);
    return envelope(true, { ...result, steps: result.results }, null, task.taskId ?? "");
  });

  app.get("/tasks/:taskId", async (req) => {
    const { taskId } = req.params as { taskId: string };
    const task = app.asyncTaskManager.get(taskId);
    if (!task) {
      return envelope(false, null, "NOT_FOUND", taskId);
    }
    return envelope(true, {
      taskId: task.taskId,
      status: task.status,
      serverUuid: task.serverUuid,
      steps: task.results,
      error: task.error,
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString(),
    }, null, taskId);
  });
}

// ===================== Helpers =====================

function envelope<T>(success: boolean, data: T, error: string | null, requestId: string) {
  return { success, data, error, requestId: requestId || randomUUID().slice(0, 12) };
}

async function executeCommandWithFollowUps(
  app: FastifyInstance,
  uuid: string,
  cmd: { action: string; [key: string]: unknown },
  taskDefaults?: { writeCfgAfter?: boolean; restartAfter?: boolean }
): Promise<{ success: boolean; message: string }> {
  const result = await executeCommand(app, uuid, cmd);
  if (!result.success) {
    return result;
  }

  const writeCfg = cmd.writeCfgAfter === true
    || (cmd.writeCfgAfter === undefined && taskDefaults?.writeCfgAfter === true);
  const restart = cmd.restartAfter === true
    || (cmd.restartAfter === undefined && taskDefaults?.restartAfter === true);

  if (writeCfg && cmd.action !== "write_cfg" && cmd.action !== "apply") {
    const writeResult = await executeCommand(app, uuid, { action: "write_cfg" });
    if (!writeResult.success) {
      return writeResult;
    }
  }

  if (restart && cmd.action !== "restart" && cmd.action !== "start" && cmd.action !== "stop") {
    return executeCommand(app, uuid, { action: "restart" });
  }

  return result;
}

function mergeConfigPackage(
  existing: ServerConfigPackage,
  patch: Record<string, unknown>
): ServerConfigPackage {
  const merged = { ...existing } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const prev = merged[key];
      if (prev !== null && typeof prev === "object" && !Array.isArray(prev)) {
        merged[key] = { ...(prev as object), ...(value as object) };
      } else {
        merged[key] = value;
      }
    } else {
      merged[key] = value;
    }
  }
  return merged as unknown as ServerConfigPackage;
}

function parseQueryBool(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  const text = String(value);
  if (text === "true" || text === "1") {
    return true;
  }
  return false;
}

async function executeCommand(
  app: FastifyInstance,
  uuid: string,
  cmd: { action: string; [key: string]: unknown }
): Promise<{ success: boolean; message: string }> {
  let config = app.configStore.load(uuid);

  switch (cmd.action) {
    // ------- Process -------
    case "status": {
      const state = app.processManager.getState(uuid, config ?? undefined);
      return { success: true, message: JSON.stringify(state) };
    }
    case "start": {
      if (!config) return fail("未找到服务器配置");
      return startServer(app, uuid, config);
    }
    case "stop": {
      return stopServer(app, uuid);
    }
    case "restart": {
      return restartServer(app, uuid);
    }

    // ------- Config -------
    case "save": {
      if (!config) return fail("未找到配置");
      app.configStore.save(uuid, config);
      return ok("配置已保存");
    }
    case "apply":
    case "write_cfg": {
      if (!config) return fail("未找到服务器配置");
      maybeAutoSnapshot(app, uuid, "write");
      const deployResult = deployMonitoringIfEnabled(app.dataDir, config);
      const result = writeAll(uuid, config);
      if (!result.success) {
        return fail(result.message);
      }
      let message = result.message;
      if (deployResult.message && deployResult.message !== "监控未启用，跳过部署") {
        message = `${message}；${deployResult.message}`;
      }
      return ok(message);
    }

    // ------- Mission -------
    case "switch_mission": {
      if (!config?.server?.serverDir) return fail("未设置服务器目录");
      const template = cmd.missionTemplate as string;
      if (!template) return fail("缺少 missionTemplate");

      const difficulty = cmd.missionDifficulty as number | undefined;
      const missions = promoteMissionToFront(
        config.tasks?.missions ?? [],
        template,
        difficulty
      );
      config.tasks = { ...config.tasks, missions };
      app.configStore.save(uuid, config);

      // 与文档一致：切换后写入游戏 cfg，否则启服仍读磁盘上旧的 Mission1。
      const writeResult = writeAll(uuid, config);
      if (!writeResult.success) {
        return fail(writeResult.message);
      }

      const restartAfterMission = cmd.restartAfterMission !== false;
      if (!restartAfterMission) {
        return ok(`任务已切换至 ${missions[0]?.template ?? template}（配置已写入，需重启生效）`);
      }

      const state = app.processManager.getState(uuid, config);
      if (state.isRunning) {
        const stopResult = await stopServer(app, uuid);
        if (!stopResult.success) {
          return stopResult;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      return startServer(app, uuid, config);
    }

    // ------- Mods -------
    case "enable_mods": {
      if (!config) return fail("未找到配置");
      const enableIds = cmd.modIds as number[] | undefined;
      if (!enableIds?.length) return fail("缺少 modIds");
      const clientModIds = new Set(config.mods?.clientModIds ?? []);
      for (const id of enableIds) {
        clientModIds.add(id);
      }
      config.mods = {
        ...config.mods,
        enabledIds: [...new Set([...(config.mods?.enabledIds ?? []), ...enableIds])],
        clientModIds: [...clientModIds],
      };
      app.configStore.save(uuid, config);
      return ok(`已启用 ${enableIds.length} 个模组`);
    }
    case "disable_mods": {
      if (!config) return fail("未找到配置");
      const disableIds = cmd.modIds as number[] | undefined ?? [];
      const scopeRaw = cmd.scope as string | undefined;
      let scope: ModDisableScope = "all";
      if (scopeRaw === "client" || scopeRaw === "server" || scopeRaw === "hc") {
        scope = scopeRaw;
      }

      if (scope === "all") {
        const localMods = (config.mods?.localMods ?? []).map((entry) => ({
          ...entry,
          isServerMod: false,
          isClientMod: false,
          isHcMod: false,
        }));
        const roleEntries = (config.mods?.roleEntries ?? []).map((entry) => ({
          ...entry,
          isServerMod: false,
          isClientMod: false,
          isHcMod: false,
        }));
        config.mods = {
          ...config.mods,
          enabledIds: [],
          serverModIds: [],
          clientModIds: [],
          hcModIds: [],
          roleEntries,
          localMods,
        };
      } else {
        config = disableModsByScope(config, disableIds, scope);
        config = syncRoleEntriesFromIds(config);
      }

      app.configStore.save(uuid, config);
      return ok(`已禁用 ${disableIds.length} 个模组 (${scope})`);
    }
    case "scan_mods": {
      if (!config) return fail("未找到配置");
      const modPaths = collectModPaths(app, config);
      if (!modPaths.length) {
        return fail("未配置模组扫描路径。请在「扫描路径」或 SteamCMD 页设置 Workshop 根目录。");
      }
      const result = scanModsForConfig(app, config);
      return ok(`扫描完成，发现 ${result.length} 个模组（${modPaths.length} 个路径）`);
    }
    case "download_mods": {
      const ids = cmd.modIds as number[] | undefined;
      if (!ids?.length) {
        return fail("缺少 modIds");
      }
      return runSteamCmdModDownload(app, ids);
    }
    case "import_mods_html": {
      if (!config) {
        return fail("未找到配置");
      }
      const ids = cmd.modIds as number[] | undefined;
      if (!ids?.length) {
        return fail("未能从 HTML 解析模组 ID");
      }

      const mergedIds = [...new Set([...(config.mods?.enabledIds ?? []), ...ids])];
      config.mods = {
        ...config.mods,
        enabledIds: mergedIds,
      };
      app.configStore.save(uuid, config);

      if (cmd.writeCfgAfter) {
        const writeResult = writeAll(uuid, config);
        if (!writeResult.success) {
          return fail(writeResult.message);
        }
      }

      const downloadResult = await runSteamCmdModDownload(app, ids);
      if (!downloadResult.success) {
        return downloadResult;
      }
      return ok(`已导入 ${ids.length} 个模组 ID。${downloadResult.message}`);
    }
    case "copy_bikeys": {
      if (!config?.server?.serverDir) return fail("未设置服务器目录");
      const modPaths = collectModPaths(app, config);
      if (!modPaths.length) return fail("未配置模组扫描路径");

      const scanned = scanModsForConfig(app, config);
      if (!scanned.length) {
        return fail("未扫描到模组，请先点击「扫描刷新」");
      }

      const serverDir = config.server.serverDir;
      const missingOnly = cmd.missingOnly === true;
      const modPathsArg = cmd.modPaths as string[] | undefined;
      let result: { copied: number; total: number; skipped: number };
      if (modPathsArg?.length) {
        result = app.modScanner.copyBikeys(modPathsArg, serverDir);
      } else if (missingOnly) {
        result = app.modScanner.copyMissingBikeys(scanned, serverDir);
      } else {
        result = app.modScanner.copyBikeysFromScanned(scanned, serverDir);
      }

      if (result.total === 0) {
        return fail(`已扫描 ${scanned.length} 个模组，但未找到任何 .bikey 文件`);
      }
      if (result.copied === 0 && result.skipped === result.total) {
        return ok(`Bikey 已全部就绪：${result.total} 个 key 已在服务器 Keys/ 目录中`);
      }
      if (result.copied === 0 && missingOnly) {
        return ok("没有需要复制的 Bikey（已启用模组均已就绪或无密钥）");
      }
      return ok(`Bikey 复制完成：新增 ${result.copied}，已有 ${result.skipped}，共 ${result.total} 个`);
    }
    case "update_server": {
      const targetDir = config?.server?.serverDir;
      if (!targetDir) {
        return fail("未设置服务器目录");
      }
      try {
        await app.steamCmd.ensureInstalled();
        await app.steamCmd.updateServer(targetDir);
        return ok("服务器文件更新完成");
      } catch (e: unknown) {
        return fail(e instanceof Error ? e.message : "更新失败");
      }
    }

    // ------- Preflight -------
    case "preflight": {
      if (!config) return fail("未找到服务器配置");
      const state = app.processManager.getState(uuid, config ?? undefined);
      const modPaths = collectModPaths(app, config);
      const scannedMods = modPaths.length > 0 ? scanModsForConfig(app, config) : [];
      const result = runPreflightChecks(uuid, config, {
        isRunning: state.isRunning,
        scannedMods,
      });
      if (result.hasBlockingErrors) {
        const first = result.issues.find((item) => item.severity === "error");
        return fail(first?.message ?? "启动前检查未通过");
      }
      return ok(`启动前检查通过（${result.issues.length} 项）`);
    }

    case "ensure_steamcmd": {
      try {
        await app.steamCmd.ensureInstalled();
        return ok("SteamCMD 已就绪");
      } catch (e: unknown) {
        return fail(e instanceof Error ? e.message : "SteamCMD 初始化失败");
      }
    }
    case "stop_steamcmd": {
      app.steamCmd.kill();
      return ok("SteamCMD 已停止");
    }
    case "steamcmd_status": {
      return ok(
        JSON.stringify({
          isRunning: app.steamCmd.isRunning,
          isInstalled: app.steamCmd.isInstalled,
        })
      );
    }
    case "install_dedicated_server": {
      const targetDir = config?.server?.serverDir;
      if (!targetDir) {
        return fail("未设置服务器目录");
      }
      try {
        await app.steamCmd.ensureInstalled();
        await app.steamCmd.updateServer(targetDir);
        return ok("专用服务器安装/更新完成");
      } catch (e: unknown) {
        return fail(e instanceof Error ? e.message : "安装失败");
      }
    }
    case "create_server": {
      const configName = String(cmd.configName ?? cmd.serverName ?? randomUUID()).trim();
      const serverDir = String(cmd.serverDir ?? "").trim();
      if (serverDir) {
        const validation = validateServerPath(serverDir);
        if (!validation.valid) {
          return fail(validation.message);
        }
      }
      const newUuid = randomUUID();
      const initialConfig: ServerConfigPackage = {
        formatVersion: 2,
        server: {
          configName,
          serverDir,
          executable: defaultServerExecutable(),
        },
      };
      app.configStore.save(newUuid, initialConfig, configName);
      return ok(`已创建服务器配置 ${configName} (${newUuid})`);
    }
    case "first_server_setup": {
      if (!config) {
        return fail("未找到服务器配置");
      }
      const serverDir = config.server?.serverDir?.trim();
      if (!serverDir) {
        return fail("未设置服务器目录");
      }
      try {
        await app.steamCmd.ensureInstalled();
        await app.steamCmd.updateServer(serverDir);
        const deployResult = deployMonitoringIfEnabled(app.dataDir, config);
        const writeResult = writeAll(uuid, config);
        if (!writeResult.success) {
          return fail(writeResult.message);
        }
        let message = `首服准备完成：${writeResult.message}`;
        if (deployResult.message) {
          message = `${message}；${deployResult.message}`;
        }
        return ok(message);
      } catch (e: unknown) {
        return fail(e instanceof Error ? e.message : "首服准备失败");
      }
    }

    // ------- RCon -------
    case "rcon_players":
    case "rcon_kick":
    case "rcon_ban":
    case "rcon_broadcast":
    case "rcon_mission":
    case "rcon_command":
    case "rcon_lock":
    case "rcon_unlock": {
      const rconOptions = config ? resolveRconOptions(config) : null;
      if (!rconOptions) return fail("未配置 RCon 密码");

      const client = new RconClient({ ...rconOptions, timeout: 5000 });
      try {
        await client.connect();
        switch (cmd.action) {
          case "rcon_players": {
            const players = await client.getPlayers();
            return ok(JSON.stringify(players));
          }
          case "rcon_kick": {
            const r = await client.kick(cmd.playerId as string, cmd.reason as string);
            return ok(r.message);
          }
          case "rcon_ban": {
            const r = await client.ban(cmd.playerGuid as string, cmd.playerId as unknown as number, cmd.reason as string);
            return ok(r.message);
          }
          case "rcon_broadcast": {
            const r = await client.broadcast(cmd.broadcastMessage as string);
            return ok(r.message);
          }
          case "rcon_mission": {
            const r = await client.loadMission(cmd.missionTemplate as string);
            return ok(r.message);
          }
          case "rcon_command": {
            const text = cmd.rconCommandText as string;
            if (!text) return fail("缺少命令文本");
            const r = await client.sendCommand(text);
            return ok(r.message);
          }
          case "rcon_lock": {
            const r = await client.sendCommand("#lock");
            return ok(r.message);
          }
          case "rcon_unlock": {
            const r = await client.sendCommand("#unlock");
            return ok(r.message);
          }
        }
      } finally {
        client.disconnect();
      }
      return fail("RCon 执行失败");
    }

    // ------- Logs -------
    case "read_logs":
    case "read_rpt": {
      if (!config?.server?.serverDir) return fail("未设置服务器目录");
      const kind = cmd.action === "read_rpt"
        ? "rpt"
        : ((cmd.logKind ?? "rpt") as "rpt" | "battleye" | "all");
      const target = app.rptLogReader.resolveAllowedLogPath(
        config.server.serverDir,
        uuid,
        kind
      );
      if (!target) return ok("无日志文件");
      const result = app.rptLogReader.readLog(target, 200);
      return ok(`日志 (${path.basename(target)}): ${result.lines.join("\n").slice(0, 2000)}`);
    }

    // ------- Help -------
    case "help": {
      return ok("Arma3 Server Tools 自动化 API。支持 action: status/start/stop/restart/save/write_cfg/switch_mission/enable_mods/disable_mods/download_mods/import_mods_html/scan_mods/update_server/preflight/rcon_players/rcon_kick/rcon_ban/rcon_broadcast/rcon_mission/rcon_lock/rcon_unlock/read_logs/help");
    }

    // ------- Local Bans -------
    case "local_ban_add": {
      if (!config?.server?.serverDir) return fail("未设置服务器目录");
      const guid = cmd.playerGuid as string;
      const reason = cmd.reason as string;
      if (!guid) return fail("缺少 playerGuid");
      const bans = loadLocalBans(config.server.serverDir, uuid);
      bans.push({ guid, time: "永久封禁", reason: reason ?? "手动封禁" });
      const result = saveLocalBans(config.server.serverDir, uuid, bans);
      if (!result.success) return fail(result.message);
      return ok(`已封禁 ${guid}`);
    }
    case "local_ban_remove": {
      if (!config?.server?.serverDir) return fail("未设置服务器目录");
      const guid = cmd.playerGuid as string;
      if (!guid) return fail("缺少 playerGuid");
      const bans = loadLocalBans(config.server.serverDir, uuid).filter(
        (item) => item.guid.toLowerCase() !== guid.toLowerCase()
      );
      const result = saveLocalBans(config.server.serverDir, uuid, bans);
      if (!result.success) return fail(result.message);
      return ok(`已解封 ${guid}`);
    }

    // ------- Headless -------
    case "start_headless_client": {
      if (!config) return fail("未找到配置");
      const result = startHeadlessClient(app, uuid, config);
      if (!result.success) {
        return fail(result.message);
      }
      return ok(result.message);
    }
    case "stop_headless_client": {
      stopHeadlessClient(uuid);
      return ok("无头客户端已停止");
    }

    // ------- Sync Cron -------
    case "sync_cron_jobs": {
      if (!config) return fail("未找到配置");
      const result = syncCronJobsForServer(app, uuid, config);
      if (!result.success) {
        return fail(result.message);
      }
      return ok(result.message);
    }

    default:
      return fail(`未知 action: ${cmd.action}`);
  }
}

async function runSteamCmdModDownload(
  app: FastifyInstance,
  modIds: number[]
): Promise<{ success: boolean; message: string }> {
  const settings = app.steamCmdSettingsStore.load();
  if (!settings.username || !settings.password) {
    return fail("请先配置 SteamCMD 账号（SteamCMD 页 → Steam 账号 → 保存凭据）");
  }
  const scanPaths = app.modScanPathStore.list().map((entry) => entry.modulePath);
  applySteamCmdSettings(app.steamCmd, settings, scanPaths);

  try {
    await app.steamCmd.ensureInstalled();
    await app.steamCmd.downloadWorkshopMods(modIds);
    return ok(`SteamCMD 已开始下载 ${modIds.length} 个模组，请在 SteamCMD 页查看输出`);
  } catch (e: unknown) {
    return fail(e instanceof Error ? e.message : "模组下载失败");
  }
}

function ok(message: string) {
  return { success: true, message };
}

function fail(message: string) {
  return { success: false, message };
}
