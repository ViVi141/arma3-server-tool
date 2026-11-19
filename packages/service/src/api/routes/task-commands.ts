import { loadLocalBans, saveLocalBans } from "../../bans/bans-service.js";
import { maybeAutoSnapshot } from "../../config/auto-snapshot.js";
import { writeAll } from "../../config/game-config-writer.js";
import { promoteMissionToFront } from "../../missions/scanner.js";
import { disableModsByScope, type ModDisableScope } from "../../mods/enabler.js";
import { applyEnableList, normalizeModImportMode, shouldDownloadForMode } from "../../mods/import-modes.js";
import { scanModsForConfig, syncRoleEntriesFromIds } from "../../mods/mod-config-sync.js";
import { collectModPaths } from "../../mods/paths.js";
import { deployMonitoringIfEnabled } from "../../monitoring/deployment.js";
import { defaultServerExecutable } from "../../platform/index.js";
import { runPreflightChecks } from "../../preflight/checker.js";
import { startHeadlessClient, stopHeadlessClient } from "../../process/headless.js";
import { resolveRconOptions } from "../../rcon/helpers.js";
import { RconClient } from "../../rcon/index.js";
import { syncCronJobsForServer } from "../../scheduling/cron-sync.js";
import { restartServer, startServer, stopServer } from "../../scheduling/server-lifecycle.js";
import { applySteamCmdSettings } from "../../settings/apply-steamcmd-settings.js";
import { validateServerPath } from "../../utils/path-validation.js";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import type { ServerConfigPackage } from "../../types/config.js";
import type { FastifyInstance } from "fastify";

export async function executeCommandWithFollowUps(
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

export async function executeCommand(
  app: FastifyInstance,
  uuid: string,
  cmd: { action: string; [key: string]: unknown }
): Promise<{ success: boolean; message: string }> {
  let config = app.configStore.load(uuid);

  switch (cmd.action) {
    // ------- Process -------
    case "status": {
      const state = await app.processManager.getState(uuid, config ?? undefined);
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

      const state = await app.processManager.getState(uuid, config);
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
      const result = scanModsForConfig(app, config, { skipSize: true });
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
      const mode = normalizeModImportMode(cmd.mode);

      if (shouldDownloadForMode(mode)) {
        const downloadResult = await runSteamCmdModDownload(app, ids);
        if (!downloadResult.success) {
          // 下载失败不改启用列表
          return downloadResult;
        }
        if (mode === "download_only") {
          return ok(`已下载 ${ids.length} 个模组（未改启用列表）。${downloadResult.message}`);
        }
      }

      const nextEnabled = applyEnableList(config.mods?.enabledIds ?? [], ids, mode);
      if (nextEnabled) {
        config.mods = {
          ...config.mods,
          enabledIds: nextEnabled,
        };
        app.configStore.save(uuid, config);

        if (cmd.writeCfgAfter) {
          const writeResult = writeAll(uuid, config);
          if (!writeResult.success) {
            return fail(writeResult.message);
          }
        }
      }

      if (mode === "merge_enable") {
        return ok(`已合并启用 ${ids.length} 个模组（未下载）`);
      }
      if (mode === "replace_enable") {
        return ok(`已替换启用列表为 ${ids.length} 个模组（未下载）`);
      }
      return ok(`已导入 ${ids.length} 个模组 ID（下载并启用）`);
    }
    case "copy_bikeys": {
      if (!config?.server?.serverDir) return fail("未设置服务器目录");
      const modPaths = collectModPaths(app, config);
      if (!modPaths.length) return fail("未配置模组扫描路径");

      const scanned = scanModsForConfig(app, config, { skipSize: true });
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
        await app.steamCmd.updateServer(targetDir);
        return ok("服务器文件更新完成");
      } catch (e: unknown) {
        return fail(e instanceof Error ? e.message : "更新失败");
      }
    }

    // ------- Preflight -------
    case "preflight": {
      if (!config) return fail("未找到服务器配置");
      const state = await app.processManager.getState(uuid, config ?? undefined);
      const modPaths = collectModPaths(app, config);
      const scannedMods = modPaths.length > 0 ? scanModsForConfig(app, config, { skipSize: true }) : [];
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
      app.steamCmd.requestAbort();
      const cancelledTaskIds = app.asyncTaskManager.cancelSteamCmdRelatedRunning();
      if (cancelledTaskIds.length > 0) {
        return ok(`已取消 SteamCMD 操作（${cancelledTaskIds.length} 个任务），将不再重试`);
      }
      return ok("已取消 SteamCMD 操作，将不再重试");
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
            const target =
              typeof cmd.playerGuid === "string" && cmd.playerGuid.trim()
                ? cmd.playerGuid.trim()
                : typeof cmd.playerId === "string" && cmd.playerId.trim()
                  ? cmd.playerId.trim()
                  : "";
            if (!target) {
              return fail("缺少 playerGuid 或 playerId");
            }
            let timeMinutes: number | undefined;
            if (
              typeof cmd.timeMinutes === "number"
              && Number.isFinite(cmd.timeMinutes)
              && cmd.timeMinutes >= 0
            ) {
              timeMinutes = cmd.timeMinutes;
            } else if (
              cmd.timeMinutes === undefined
              && typeof cmd.playerId === "number"
              && Number.isFinite(cmd.playerId)
              && cmd.playerId >= 0
            ) {
              // Legacy RconView.vue passes ban duration in numeric playerId
              timeMinutes = cmd.playerId;
            }
            const reason = typeof cmd.reason === "string" ? cmd.reason : undefined;
            const r = await client.ban(target, timeMinutes, reason);
            return ok(r.message);
          }
          case "rcon_broadcast": {
            const r = await client.broadcast(cmd.broadcastMessage as string);
            return ok(r.message);
          }
          case "rcon_mission": {
            const missionName =
              typeof cmd.rconMissionName === "string"
                ? cmd.rconMissionName
                : typeof cmd.missionTemplate === "string"
                  ? cmd.missionTemplate
                  : "";
            const r = await client.loadMission(missionName);
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
        : ((cmd.logKind ?? "rpt") as "rpt" | "battleye" | "console" | "all");
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
  const scanPaths = app.modScanPathStore.list().map((entry) => entry.modulePath);
  applySteamCmdSettings(app.steamCmd, settings, scanPaths);
  // 与 SteamCmdManager.hasCredentials 保持一致：cached 登录模式只需用户名，
  // 不能在此处强制要求密码，否则设置页显示已配置、下载却报未配置。
  if (!app.steamCmd.hasCredentials) {
    return fail("请先配置 SteamCMD 账号（SteamCMD 页 → Steam 账号 → 保存凭据）");
  }

  try {
    // downloadWorkshopMods 内部已 ensureInstalled，并持有全局互斥锁。
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
