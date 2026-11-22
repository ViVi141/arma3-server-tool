import { maybeAutoSnapshot } from "../../config/auto-snapshot.js";
import { writeAll, serverCfgExists, getServerExecutablePath, CONFIG_FOLDER } from "../../config/game-config-writer.js";
import { evaluateSyncState } from "../../config/sync-state.js";
import { runFullDiagnostics } from "../../diagnostics/service.js";
import { scanModsForConfig } from "../../mods/mod-config-sync.js";
import { collectModPaths, isModDirectory } from "../../mods/paths.js";
import { defaultServerExecutable } from "../../platform/index.js";
import { runPreflightChecks } from "../../preflight/checker.js";
import { verifyProcessIdentity, isValidPid } from "../../process/identity.js";
import {
  fetchRconPlayers,
  resolveRconOptions,
  countOnlinePlayers,
  getCachedOnlineCount,
} from "../../rcon/helpers.js";
import { dropRconSession } from "../../rcon/session.js";
import { clearCronJobsForServer } from "../../scheduling/cron-sync.js";
import { stopServer } from "../../scheduling/server-lifecycle.js";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import type { ServerConfigPackage } from "../../types/config.js";
import type { LocalModEntry } from "../../types/mods.js";
import type { FastifyInstance } from "fastify";
import { envelope, parseQueryBool } from "./shared.js";
import { validateHealthConfig } from "../../health/configuration.js";
import { validateMaintenancePolicy } from "../../maintenance/policy.js";

export function registerServersRoutes(app: FastifyInstance): void {
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
      let configName = s.configName;
      if (config?.server?.configName && config.server.configName.trim()) {
        configName = config.server.configName.trim();
      }
      return {
        uuid: s.uuid,
        configName,
        serverDir: serverDir ?? undefined,
      };
    });
  });

  app.get("/servers/:uuid/status", async (req) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    const state = await app.processManager.getState(uuid, config ?? undefined);
    return {
      isRunning: state.isRunning,
      pid: state.pid,
      activeMissionTemplate: config?.tasks?.missions?.[0]?.template,
      serverModCount: config?.mods?.serverModIds?.length ?? 0,
    };
  });

  app.get("/servers/:uuid/health", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    if (!app.configStore.load(uuid)) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    return envelope(true, await app.serverHealth.get(uuid), null, uuid);
  });

  // Config read/write
  app.get("/servers/:uuid/config", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const query = req.query as { reload?: string };
    const forceDisk =
      parseQueryBool(query.reload) && app.uiSettingsStore.load().allowExternalConfigRefresh;
    const config = app.configStore.load(uuid, { forceDisk });
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    return envelope(true, config, null, uuid);
  });

  app.put("/servers/:uuid/config", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const body = req.body as Record<string, unknown>;
    try {
      const sanitized = sanitizeImportedProcessId(
        uuid,
        body as unknown as ServerConfigPackage,
        app
      );
      try { validateHealthConfig(sanitized); } catch (error) {
        reply.status(400);
        return envelope(false, { message: error instanceof Error ? error.message : "健康配置无效" }, "INVALID_HEALTH_CONFIG", uuid);
      }
      try { sanitized.maintenance = validateMaintenancePolicy(sanitized.maintenance); } catch (error) {
        reply.status(400);
        return envelope(false, { message: error instanceof Error ? error.message : "维护配置无效" }, "INVALID_MAINTENANCE_CONFIG", uuid);
      }
      const query = req.query as { writeCfg?: string };
      if (parseQueryBool(query.writeCfg)) {
        // 先写 cfg 再保存配置：写入失败时不落库，避免「接口报错但配置已被覆盖」。
        maybeAutoSnapshot(app, uuid, "write");
        const writeResult = writeAll(uuid, sanitized);
        if (!writeResult.success) {
          reply.status(400);
          return envelope(false, { message: writeResult.message }, "WRITE_CFG_FAILED", uuid);
        }
        maybeAutoSnapshot(app, uuid, "save");
        app.configStore.save(uuid, sanitized);
        return envelope(
          true,
          { message: `配置已保存并写入。${writeResult.message}` },
          null,
          uuid
        );
      }

      maybeAutoSnapshot(app, uuid, "save");
      app.configStore.save(uuid, sanitized);
      return envelope(true, { message: "配置已保存" }, null, uuid);
    } catch (err) {
      req.log.error({ err, uuid }, "保存配置失败");
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
    const sanitized = sanitizeImportedProcessId(uuid, merged, app);
    try { validateHealthConfig(sanitized); } catch (error) {
      reply.status(400);
      return envelope(false, { message: error instanceof Error ? error.message : "健康配置无效" }, "INVALID_HEALTH_CONFIG", uuid);
    }
    try { sanitized.maintenance = validateMaintenancePolicy(sanitized.maintenance); } catch (error) {
      reply.status(400);
      return envelope(false, { message: error instanceof Error ? error.message : "维护配置无效" }, "INVALID_MAINTENANCE_CONFIG", uuid);
    }
    const query = req.query as { writeCfg?: string };
    if (parseQueryBool(query.writeCfg)) {
      // 先写 cfg 再保存配置（同 PUT）：写失败时不覆盖已保存的配置。
      maybeAutoSnapshot(app, uuid, "write");
      const writeResult = writeAll(uuid, sanitized);
      if (!writeResult.success) {
        reply.status(400);
        return envelope(false, { message: writeResult.message }, "WRITE_CFG_FAILED", uuid);
      }
      maybeAutoSnapshot(app, uuid, "save");
      app.configStore.save(uuid, sanitized);
      return envelope(
        true,
        { message: `配置已更新。${writeResult.message}` },
        null,
        uuid
      );
    }

    maybeAutoSnapshot(app, uuid, "save");
    app.configStore.save(uuid, sanitized);
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
    const cloned: ServerConfigPackage = {
      ...config,
      // 复制时保留时段供查看，但新实例必须重新授权自动维护和断开玩家。
      maintenance: { ...validateMaintenancePolicy(config.maintenance), enabled: false, windowConfirmed: false, allowOccupied: false, occupiedConfirmed: false },
      tasks: {
        ...config.tasks,
        processById: 0,
      },
    };
    if (cloned.server?.configName) {
      cloned.server = {
        ...cloned.server,
        configName: `${cloned.server.configName} (副本)`,
      };
    }
    app.configStore.save(newUuid, cloned, cloned.server?.configName);
    reply.status(201);
    return envelope(true, { uuid: newUuid }, null, uuid);
  });

  app.delete("/servers/:uuid", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }

    // 删除运行中的服务器会留下无法管理的孤儿进程（占端口、锁 profile），
    // 必须先确认已停止；停止失败则拒绝删除并返回 409。
    const state = await app.processManager.getState(uuid, config);
    if (state.isRunning) {
      const stopResult = await stopServer(app, uuid);
      if (!stopResult.success) {
        reply.status(409);
        return envelope(
          false,
          { message: `服务器仍在运行，无法删除: ${stopResult.message}` },
          "SERVER_RUNNING",
          uuid
        );
      }
    }

    clearCronJobsForServer(app, uuid);
    app.processManager.forget(uuid);
    dropRconSession(uuid);
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
    const newName = typeof body?.newName === "string" ? body.newName.trim() : "";
    if (!newName) {
      reply.status(400);
      return envelope(false, null, "INVALID_BODY", uuid);
    }
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    config.server = {
      ...config.server,
      configName: newName,
    };
    app.configStore.save(uuid, config, newName);
    return envelope(true, { message: "已重命名", configName: newName }, null, uuid);
  });

  // ===================== Preflight =====================
  app.get("/servers/:uuid/preflight", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }

    const state = await app.processManager.getState(uuid, config ?? undefined);
    const modPaths = collectModPaths(app, config);
    const scannedMods = modPaths.length > 0
      ? scanModsForConfig(app, config, { skipSize: true })
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
    const options = resolveRconOptions(config);
    if (!options) {
      reply.status(400);
      return envelope(false, null, "RCON_NOT_CONFIGURED", uuid);
    }

    try {
      const players = await fetchRconPlayers(config, uuid);
      return envelope(
        true,
        { players, count: players.length, endpoint: `${options.host}:${options.port}` },
        null,
        uuid
      );
    } catch (error) {
      reply.status(502);
      const message = error instanceof Error ? error.message : "RCon 连接失败";
      return envelope(false, { message }, "RCON_FAILED", uuid);
    }
  });

  app.get("/servers/:uuid/diagnostics", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const state = await app.processManager.getState(uuid, config ?? undefined);
    const modPaths = collectModPaths(app, config);
    const scannedMods = modPaths.length > 0 ? scanModsForConfig(app, config, { skipSize: true }) : [];
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
    const serverConfigDir = serverDir
      ? path.join(serverDir, CONFIG_FOLDER, uuid)
      : "";
    return envelope(
      true,
      {
        toolConfigDir: app.configStore.getServerConfigDir(uuid),
        dataConfigDir: app.configStore.getConfigDir(),
        serverDir,
        serverConfigDir,
        // 控制台/RPT 落在 profiles（a3st_serverconfig/<uuid>）；stdout 捕获在 serverDir/logs（Linux）
        logDir: serverConfigDir || (serverDir ? path.join(serverDir, "logs") : ""),
        processLogDir: serverDir ? path.join(serverDir, "logs") : "",
      },
      null,
      uuid
    );
  });

  app.get("/servers/:uuid/dashboard", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }

    const state = await app.processManager.getState(uuid, config ?? undefined);
    const basic = (config.basic ?? {}) as Record<string, unknown>;
    const startup = (config.startup ?? {}) as Record<string, unknown>;
    const scheduler = (config.scheduler ?? {}) as Record<string, unknown>;

    let onlineCount: number | null = null;
    if (state.isRunning && config.battleye?.rconPassword) {
      // The dashboard polls every few seconds. Answer from the shared session
      // cache and refresh it at most once per 20s so polling never floods the
      // server with fresh BattlEye logins.
      const cached = getCachedOnlineCount(uuid);
      if (cached && Date.now() - cached.at < 20_000) {
        onlineCount = cached.onlineCount;
      } else {
        onlineCount = await countOnlinePlayers(config, uuid);
        if (onlineCount === null && cached) {
          onlineCount = cached.onlineCount;
        }
      }
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

/**
 * Clone/import 常会带上源服的 processById。仅在本 uuid 已有托管进程，
 * 或 PID 经 -name/-port 身份校验匹配时保留；否则清零，避免误报 running / 误杀。
 */
function sanitizeImportedProcessId(
  uuid: string,
  config: ServerConfigPackage,
  app: FastifyInstance
): ServerConfigPackage {
  const livePid = app.processManager.getPid(uuid);
  if (livePid && livePid > 0) {
    return {
      ...config,
      tasks: {
        ...config.tasks,
        processById: livePid,
      },
    };
  }

  const rawPid = config.tasks?.processById;
  const importedPid = isValidPid(rawPid) ? rawPid : 0;
  if (importedPid <= 0) {
    return {
      ...config,
      tasks: {
        ...config.tasks,
        processById: 0,
      },
    };
  }

  const executable = getServerExecutablePath(config);
  let expectedPort = 0;
  if (config.startup?.port && config.startup.port > 0) {
    expectedPort = config.startup.port;
  } else if (config.basic?.port && config.basic.port > 0) {
    expectedPort = config.basic.port;
  }

  let portMarker: number | undefined;
  if (expectedPort > 0) {
    portMarker = expectedPort;
  }

  const identity = verifyProcessIdentity(importedPid, executable, {
    profileName: uuid,
    port: portMarker,
  });
  if (identity === "match") {
    return config;
  }

  return {
    ...config,
    tasks: {
      ...config.tasks,
      processById: 0,
    },
  };
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
}
