import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { RconClient } from "../rcon/index.js";
import type { ServerConfigPackage } from "../types/config.js";
import {
  writeAll,
  buildStartCommandLine,
  splitCommandLine,
  serverCfgExists,
  getServerExecutablePath,
} from "../config/game-config-writer.js";
import { runPreflightChecks } from "../preflight/checker.js";
import { fetchRconPlayers, resolveRconOptions } from "../rcon/helpers.js";
import { maybeAutoSnapshot } from "../config/auto-snapshot.js";
import { evaluateSyncState } from "../config/sync-state.js";
import { disableModsByScope, resolveModPaths, type ModDisableScope } from "../mods/enabler.js";
import { startHeadlessClient, stopHeadlessClient } from "../process/headless.js";
import type { UiSettings } from "../settings/ui-settings.js";
import type { ModScanPathEntry } from "../mods/scan-path-store.js";

export async function apiRoutes(app: FastifyInstance) {
  // ===================== Servers CRUD =====================

  app.get("/servers", async () => {
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
    const state = app.processManager.getState(uuid);
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
    const config = app.configStore.load(uuid);
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
    app.configStore.save(uuid, { formatVersion: 2 }, body?.configName ?? uuid);
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
    return envelope(true, { steamCmdDir: app.dataDir }, null, "");
  });

  app.put("/settings/steamcmd", async (req) => {
    const body = req.body as Record<string, unknown>;
    // Settings persisted via service config in production
    return envelope(true, { message: "SteamCMD 设置已保存", data: body }, null, "");
  });

  app.get("/settings/ui", async () => {
    return envelope(true, app.uiSettingsStore.load(), null, "");
  });

  app.put("/settings/ui", async (req, reply) => {
    const body = req.body as Partial<UiSettings>;
    const current = app.uiSettingsStore.load();
    const merged: UiSettings = {
      showAdvancedSettings: true,
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
    app.modScanPathStore.save(body.paths);
    return envelope(true, { paths: body.paths, message: "模组扫描路径已保存" }, null, "");
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

    const state = app.processManager.getState(uuid);
    const modPaths = config.server?.modPaths ?? [];
    const scannedMods = modPaths.length > 0
      ? app.modScanner.scan({
          modPaths,
          enabledIds: config.mods?.enabledIds ?? [],
          serverModIds: config.mods?.serverModIds ?? [],
        })
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
    const mods = app.modScanner.scan({
      modPaths,
      enabledIds: config.mods?.enabledIds ?? [],
      serverModIds: config.mods?.serverModIds ?? [],
    });

    return envelope(true, { mods }, null, uuid);
  });

  app.get("/servers/:uuid/mods/bikeys", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }

    const modPaths = collectModPaths(app, config);
    const summary = app.modScanner.summarizeBikeys({
      modPaths,
      enabledIds: config.mods?.enabledIds ?? [],
      serverModIds: config.mods?.serverModIds ?? [],
    });

    return envelope(true, summary, null, uuid);
  });

  app.get("/servers/:uuid/dashboard", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      return envelope(false, null, "NOT_FOUND", uuid);
    }

    const state = app.processManager.getState(uuid);
    const basic = (config.basic ?? {}) as Record<string, unknown>;
    const startup = (config.startup ?? {}) as Record<string, unknown>;
    const scheduler = (config.scheduler ?? {}) as Record<string, unknown>;

    let onlineCount: number | null = null;
    if (state.isRunning && config.battleye?.rconPassword) {
      onlineCount = await countOnlinePlayers(config);
    }

    const monitoring = app.monitorDb.getSummary(uuid);
    const latestRpt = config.server?.serverDir
      ? app.rptLogReader.listLogs(config.server.serverDir, "rpt")[0]?.fileName ?? null
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
    const rptPath = app.rptLogReader.findActiveRpt(config.server.serverDir);
    if (!rptPath) {
      return envelope(true, { lines: ["[未找到 RPT 日志]"], totalLines: 0 }, null, uuid);
    }
    const result = app.rptLogReader.readLog(rptPath, 200);
    return envelope(true, result, null, uuid);
  });

  app.get("/servers/:uuid/logs", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { kind?: string };
    const kind = query.kind ?? "all";
    return envelope(true, { kind, serverDir: "", files: [] }, null, uuid);
  });

  app.get("/servers/:uuid/logs/read", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { kind?: string; tail?: string };
    const config = app.configStore.load(uuid);
    if (!config?.server?.serverDir) {
      return envelope(true, { lines: ["[未设置服务器目录]"], totalLines: 0 }, null, uuid);
    }
    const kind = (query.kind ?? "rpt") as "rpt" | "battleye" | "all";
    const maxLines = parseInt(query.tail ?? "200", 10);
    const logs = app.rptLogReader.listLogs(config.server.serverDir, kind);
    if (logs.length === 0) {
      return envelope(true, { lines: ["[无日志文件]"], totalLines: 0 }, null, uuid);
    }
    const result = app.rptLogReader.readLog(logs[0].filePath, maxLines);
    return envelope(true, result, null, uuid);
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
      const state = app.processManager.getState(s.uuid);
      if (!state.isRunning) {
        continue;
      }
      const config = app.configStore.load(s.uuid);
      let playerCount = 0;
      if (config) {
        const online = await countOnlinePlayers(config);
        if (online !== null) {
          playerCount = online;
        }
      }
      app.monitorDb.recordStats(s.uuid, playerCount);
      count++;
    }
    return envelope(true, { collected: count }, null, "");
  });

  // ===================== Scheduled Tasks =====================

  app.get("/schedule", async () => {
    return envelope(true, [], null, "");
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
            const args = splitCommandLine(buildStartCommandLine(body.serverUuid!, config));
            app.processManager.register(body.serverUuid!, {
              executable,
              args,
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
    return envelope(true, { message: "快照已恢复" }, null, uuid);
  });

  // ===================== Bans =====================

  app.get("/bans", async () => {
    return envelope(true, loadLocalBans(app.dataDir), null, "");
  });

  app.post("/bans", async (req, reply) => {
    const body = req.body as BanEntry | BanEntry[] | null;
    if (Array.isArray(body)) {
      saveLocalBans(app.dataDir, body);
      return envelope(true, { message: "封禁列表已保存", count: body.length }, null, "");
    }
    if (!body?.guid && !body?.ip) {
      reply.status(400);
      return envelope(false, null, "INVALID_BAN", "");
    }
    const bans = loadLocalBans(app.dataDir);
    bans.push({ ...body, date: body.date ?? new Date().toISOString(), reason: body.reason ?? "手动封禁" });
    saveLocalBans(app.dataDir, bans);
    return envelope(true, { message: "封禁已添加" }, null, "");
  });

  app.delete("/bans/:guid", async (req) => {
    const { guid } = req.params as { guid: string };
    const bans = loadLocalBans(app.dataDir).filter((b) => b.guid !== guid);
    saveLocalBans(app.dataDir, bans);
    return envelope(true, { message: "封禁已移除" }, null, guid);
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

    return envelope(true, {
      success: result.success,
      message: result.message,
      modCount: ids.length,
      requiresSteamCmd: true,
    }, null, uuid);
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
    };

    if (!task.serverUuid || !task.commands?.length) {
      reply.status(400);
      return envelope(false, null, "INVALID_TASK", task.serverUuid ?? "");
    }

    const uuid = task.serverUuid as string;
    const cmds = task.commands as { action: string; [key: string]: unknown }[];

    if (task.async) {
      const taskId = await app.asyncTaskManager.runAsync(uuid, cmds, (cmd) => executeCommand(app, uuid, cmd));
      return envelope(true, { taskId, status: "Running" }, null, uuid);
    }

    const result = await app.asyncTaskManager.runSync(uuid, cmds, (cmd) => executeCommand(app, uuid, cmd));
    return envelope(true, result, null, task.taskId ?? "");
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

async function countOnlinePlayers(config: ServerConfigPackage): Promise<number | null> {
  try {
    const players = await fetchRconPlayers(config);
    return players.length;
  } catch {
    return null;
  }
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
      const state = app.processManager.getState(uuid);
      return { success: true, message: JSON.stringify(state) };
    }
    case "start": {
      if (!config) return fail("未找到服务器配置");
      const serverDir = config.server?.serverDir;
      if (!serverDir) return fail("未设置服务器目录");
      if (!serverCfgExists(serverDir, uuid)) {
        return fail("尚未写入游戏配置，请先执行「写入服务器」");
      }
      const executable = getServerExecutablePath(config);
      if (!fs.existsSync(executable)) {
        return fail(`找不到可执行文件: ${executable}`);
      }
      const args = splitCommandLine(buildStartCommandLine(uuid, config));
      app.processManager.register(uuid, {
        executable,
        args,
        cwd: serverDir,
      });
      await app.processManager.start(uuid);
      return ok("服务器已启动");
    }
    case "stop": {
      app.processManager.kill(uuid);
      return ok("服务器已停止");
    }
    case "restart": {
      app.processManager.kill(uuid);
      await new Promise((r) => setTimeout(r, 2000));
      if (!config) return fail("未找到服务器配置");
      const serverDir = config.server?.serverDir;
      if (!serverDir) return fail("未设置服务器目录");
      if (!serverCfgExists(serverDir, uuid)) {
        return fail("尚未写入游戏配置，请先执行「写入服务器」");
      }
      const executable = getServerExecutablePath(config);
      if (!fs.existsSync(executable)) {
        return fail(`找不到可执行文件: ${executable}`);
      }
      const args = splitCommandLine(buildStartCommandLine(uuid, config));
      app.processManager.register(uuid, {
        executable,
        args,
        cwd: serverDir,
      });
      await app.processManager.start(uuid);
      return ok("服务器已重启");
    }

    // ------- Config -------
    case "save": {
      // Already persisted via PATCH/PUT — this is a manual trigger
      return ok("配置已保存");
    }
    case "write_cfg": {
      if (!config) return fail("未找到服务器配置");
      maybeAutoSnapshot(app, uuid, "write");
      const result = writeAll(uuid, config);
      if (!result.success) {
        return fail(result.message);
      }
      return ok(result.message);
    }

    // ------- Mission -------
    case "switch_mission": {
      if (!config?.server?.serverDir) return fail("未设置服务器目录");
      const template = cmd.missionTemplate as string;
      if (!template) return fail("缺少 missionTemplate");

      const missions = config.tasks?.missions ?? [];
      if (!missions.some((m) => m.template === template)) {
        missions.push({ template, difficulty: (cmd.missionDifficulty as number) ?? 3 });
      }
      config.tasks = { ...config.tasks, missions };
      app.configStore.save(uuid, config);
      return ok(`任务已切换至 ${template}（需重启生效）`);
    }

    // ------- Mods -------
    case "enable_mods": {
      if (!config) return fail("未找到配置");
      const enableIds = cmd.modIds as number[] | undefined;
      if (!enableIds?.length) return fail("缺少 modIds");
      config.mods = {
        ...config.mods,
        enabledIds: [...new Set([...(config.mods?.enabledIds ?? []), ...enableIds])],
      };
      // Update startup parameters with mod list
      const enabledList = config.mods?.enabledIds ?? [];
      if (enabledList.length > 0 && config?.server?.serverDir) {
        const modParam = `-mod=${enabledList.map((id) => `workshop_${id}`).join(";@")}`;
        config.startup = {
          ...config.startup,
          parameters: appendModParam(config.startup?.parameters ?? "", modParam),
        };
      }
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
        const ids = new Set(disableIds);
        config.mods = {
          ...config.mods,
          enabledIds: (config.mods?.enabledIds ?? []).filter((id) => !ids.has(id)),
          serverModIds: (config.mods?.serverModIds ?? []).filter((id) => !ids.has(id)),
          clientModIds: (config.mods?.clientModIds ?? []).filter((id) => !ids.has(id)),
          hcModIds: (config.mods?.hcModIds ?? []).filter((id) => !ids.has(id)),
        };
        if (config?.startup?.parameters) {
          config.startup.parameters = config.startup.parameters.replace(/-mod=[^ ]+/g, "").replace(/\s{2,}/g, " ").trim();
        }
      } else {
        config = disableModsByScope(config, disableIds, scope);
      }

      app.configStore.save(uuid, config);
      return ok(`已禁用 ${disableIds.length} 个模组 (${scope})`);
    }
    case "scan_mods": {
      if (!config) return fail("未找到配置");
      const modPaths = collectModPaths(app, config);
      const result = app.modScanner.scan({
        modPaths,
        enabledIds: config.mods?.enabledIds ?? [],
        serverModIds: config.mods?.serverModIds ?? [],
      });
      return ok(`扫描完成，发现 ${result.length} 个模组`);
    }
    case "download_mods": {
      const ids = cmd.modIds as number[] | undefined;
      if (!ids?.length) return fail("缺少 modIds");
      // Start download in background (non-blocking)
      app.steamCmd.downloadWorkshopMods(ids).then(() => {
        app.log.info(`模组下载完成: ${ids.length} 个`);
      }).catch((e: Error) => {
        app.log.error(`模组下载失败: ${e.message}`);
      });
      return ok(`开始下载 ${ids.length} 个模组（SteamCMD）`);
    }
    case "import_mods_html": {
      if (!config) return fail("未找到配置");
      const ids = cmd.modIds as number[] | undefined;
      if (!ids?.length) return fail("未能从 HTML 解析模组 ID");

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

      app.steamCmd.downloadWorkshopMods(ids).catch((e: Error) => {
        app.log.error(`模组下载失败: ${e.message}`);
      });

      return ok(`已导入 ${ids.length} 个模组 ID，SteamCMD 下载已排队`);
    }
    case "copy_bikeys": {
      if (!config?.server?.serverDir) return fail("未设置服务器目录");
      const modPaths = collectModPaths(app, config);
      if (!modPaths.length) return fail("未配置模组扫描路径");

      const scanned = app.modScanner.scan({
        modPaths,
        enabledIds: config.mods?.enabledIds ?? [],
        serverModIds: config.mods?.serverModIds ?? [],
      });
      const enabledPaths = scanned.filter((m) => m.enabled).map((m) => m.path);
      const keysDir = path.join(config.server.serverDir, "keys");
      const result = app.modScanner.copyBikeys(enabledPaths, keysDir);
      return ok(`Bikey 复制完成：新增 ${result.copied}，已有 ${result.skipped}，共 ${result.total} 个`);
    }
    case "update_server": {
      const targetDir = config?.server?.serverDir;
      app.steamCmd.ensureInstalled()
        .then(() => app.steamCmd.updateServer(targetDir))
        .catch((e: Error) => app.steamCmd.emit("output", `更新失败: ${e.message}`));
      return ok("服务器更新已排队");
    }

    // ------- Preflight -------
    case "preflight": {
      if (!config) return fail("未找到服务器配置");
      const issues = [];
      if (config.server?.serverDir && !fs.existsSync(config.server.serverDir)) {
        issues.push("服务器目录不存在");
      }
      return ok(issues.length ? `发现 ${issues.length} 个问题` : "体检通过");
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
      const rconHost = "127.0.0.1";
      const rconPort = config?.battleye?.rconPort ?? 2302;
      const rconPwd = config?.battleye?.rconPassword;
      if (!rconPwd) return fail("未配置 RCon 密码");

      const client = new RconClient({ host: rconHost, port: rconPort, password: rconPwd, timeout: 5000 });
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
    case "read_logs": {
      if (!config?.server?.serverDir) return fail("未设置服务器目录");
      const kind = (cmd.logKind ?? "rpt") as "rpt" | "battleye" | "all";
      const logs = app.rptLogReader.listLogs(config.server.serverDir, kind);
      if (logs.length === 0) return ok("无日志文件");
      const result = app.rptLogReader.readLog(logs[0].filePath, 200);
      return ok(`日志 (${logs[0].fileName}): ${result.lines.join("\\n").slice(0, 2000)}`);
    }

    // ------- Help -------
    case "help": {
      return ok("Arma3 Server Tools 自动化 API。支持 action: status/start/stop/restart/save/write_cfg/switch_mission/enable_mods/disable_mods/download_mods/import_mods_html/scan_mods/update_server/preflight/rcon_players/rcon_kick/rcon_ban/rcon_broadcast/rcon_mission/rcon_lock/rcon_unlock/read_logs/help");
    }

    // ------- Local Bans -------
    case "local_ban_add": {
      const guid = cmd.playerGuid as string;
      const reason = cmd.reason as string;
      if (!guid) return fail("缺少 playerGuid");
      const bans = loadLocalBans(app.dataDir);
      bans.push({ guid, reason: reason ?? "手动封禁", date: new Date().toISOString() });
      saveLocalBans(app.dataDir, bans);
      return ok(`已封禁 ${guid}`);
    }
    case "local_ban_remove": {
      const guid = cmd.playerGuid as string;
      if (!guid) return fail("缺少 playerGuid");
      const bans = loadLocalBans(app.dataDir).filter((b: BanEntry) => b.guid !== guid);
      saveLocalBans(app.dataDir, bans);
      return ok(`已解封 ${guid}`);
    }

    // ------- Headless -------
    case "start_headless_client": {
      if (!config) return fail("未找到配置");
      const result = startHeadlessClient(uuid, config);
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
      app.scheduler.clear();
      let count = 0;
      const schedulerCfg = config.scheduler ?? {};

      if (schedulerCfg.restartCron) {
        const cronExpr = schedulerCfg.restartCron;
        app.scheduler.add({
          name: `${uuid}-restart`,
          schedule: cronExpr,
          handler: async () => {
            app.processManager.kill(uuid);
            await new Promise((r) => setTimeout(r, 2000));
            const latest = app.configStore.load(uuid);
            if (!latest?.server?.serverDir) {
              return;
            }
            if (!serverCfgExists(latest.server.serverDir, uuid)) {
              return;
            }
            const executable = getServerExecutablePath(latest);
            if (!fs.existsSync(executable)) {
              return;
            }
            const args = splitCommandLine(buildStartCommandLine(uuid, latest));
            app.processManager.register(uuid, {
              executable,
              args,
              cwd: latest.server.serverDir,
            });
            await app.processManager.start(uuid);
          },
        });
        count += 1;
      }

      if (schedulerCfg.monitoringCron) {
        app.scheduler.add({
          name: `${uuid}-monitoring`,
          schedule: schedulerCfg.monitoringCron,
          handler: async () => {
            const latest = app.configStore.load(uuid);
            if (!latest) {
              return;
            }
            const state = app.processManager.getState(uuid);
            if (!state.isRunning) {
              return;
            }
            const online = await countOnlinePlayers(latest);
            if (online !== null) {
              app.monitorDb.recordStats(uuid, online);
            }
          },
        });
        count += 1;
      }

      const cronJobs = schedulerCfg.cronJobs ?? {};
      for (const [taskId, job] of Object.entries(cronJobs)) {
        if (!job || !job.cron) {
          continue;
        }
        const enabled = job.enabled ?? job.status === 1;
        if (!enabled) {
          continue;
        }
        const actionText = String(job.actionText ?? job.action ?? "restart").toLowerCase();
        app.scheduler.add({
          name: `${uuid}-cron-${taskId}`,
          schedule: job.cron,
          handler: async () => {
            if (actionText.includes("restart")) {
              app.processManager.kill(uuid);
              await new Promise((r) => setTimeout(r, 2000));
              const latest = app.configStore.load(uuid);
              if (!latest?.server?.serverDir) {
                return;
              }
              if (!serverCfgExists(latest.server.serverDir, uuid)) {
                return;
              }
              const executable = getServerExecutablePath(latest);
              if (!fs.existsSync(executable)) {
                return;
              }
              const args = splitCommandLine(buildStartCommandLine(uuid, latest));
              app.processManager.register(uuid, {
                executable,
                args,
                cwd: latest.server.serverDir,
              });
              await app.processManager.start(uuid);
            }
          },
        });
        count += 1;
      }

      return ok(`定时任务已同步 (${count} 个)`);
    }

    default:
      return fail(`未知 action: ${cmd.action}`);
  }
}

// ---- Local Ban helpers ----

interface BanEntry {
  guid?: string;
  ip?: string;
  reason?: string;
  date?: string;
  name?: string;
}

function bansFilePath(dataDir: string): string {
  return path.join(dataDir, "bans.json");
}

function loadLocalBans(dataDir: string): BanEntry[] {
  const fp = bansFilePath(dataDir);
  if (!fs.existsSync(fp)) return [];
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch { return []; }
}

function saveLocalBans(dataDir: string, bans: BanEntry[]): void {
  fs.writeFileSync(bansFilePath(dataDir), JSON.stringify(bans, null, 2), "utf-8");
}

function collectModPaths(app: FastifyInstance, config: ServerConfigPackage): string[] {
  const globalPaths = app.modScanPathStore.list().map((entry) => entry.modulePath);
  return resolveModPaths(config, globalPaths);
}

function ok(message: string) {
  return { success: true, message };
}
function appendModParam(existing: string, modParam: string): string {
  const cleaned = existing.replace(/-mod=[^ ]+/g, "").replace(/\s{2,}/g, " ").trim();
  return (cleaned + " " + modParam).trim();
}

function fail(message: string) {
  return { success: false, message };
}
