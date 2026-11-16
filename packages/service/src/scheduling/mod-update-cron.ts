import type { FastifyInstance } from "fastify";
import { fetchWorkshopModDetails } from "../steamcmd/workshop-api.js";
import { scanModsForConfig } from "../mods/mod-config-sync.js";
import { collectModPaths } from "../mods/paths.js";
import { isInQuietHours } from "./quiet-hours.js";
import { startServer, stopServer } from "./server-lifecycle.js";

/** 全局互斥：同时只允许一次「全停 → 更新模组 → 重启」。 */
let modUpdateInFlight = false;

export interface ModUpdateCronOptions {
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export interface ModUpdateCronResult {
  success: boolean;
  message: string;
  outdatedIds?: number[];
  skippedQuietHours?: boolean;
  stoppedUuids?: string[];
  restartedUuids?: string[];
}

/**
 * 定时检查该服已启用 Workshop 模组是否 outdated。
 * - 禁更窗内：只检查/记录，不下载。
 * - 窗外且有更新：停掉工具内全部服务器 → 下载 → 重启先前在跑的服。
 */
export async function runScheduledModUpdate(
  app: FastifyInstance,
  uuid: string,
  options: ModUpdateCronOptions = {},
): Promise<ModUpdateCronResult> {
  if (modUpdateInFlight) {
    return {
      success: true,
      message: "已有模组定时更新在进行，本次跳过",
    };
  }

  const config = app.configStore.load(uuid);
  if (!config) {
    return { success: false, message: "未找到配置" };
  }

  const enabledIds = [...new Set((config.mods?.enabledIds ?? []).filter((id) => id > 0))];
  if (!enabledIds.length) {
    return { success: true, message: "无已启用模组，跳过检查" };
  }

  // 尽量带上本地路径，便于 resolveUpdateStatus 判断 outdated
  let localMods: { modId: number; path?: string; updatedAt?: string }[] = [];
  try {
    if (collectModPaths(app, config).length) {
      const scanned = scanModsForConfig(app, config);
      localMods = scanned
        .filter((m) => m.workshopId > 0)
        .map((m) => ({
          modId: m.workshopId,
          path: m.path || undefined,
          updatedAt: m.updatedTime && m.updatedTime !== "-" ? m.updatedTime : undefined,
        }));
    }
  } catch {
    localMods = [];
  }

  let details;
  try {
    details = await fetchWorkshopModDetails(enabledIds, localMods);
  } catch (err) {
    return {
      success: false,
      message: `检查 Workshop 更新失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const outdatedIds = details
    .filter((d) => d.updateStatus === "outdated" || d.updateStatus === "missing")
    .map((d) => d.modId);

  if (!outdatedIds.length) {
    return {
      success: true,
      message: `已检查 ${enabledIds.length} 个启用模组，全部最新`,
      outdatedIds: [],
    };
  }

  const inQuiet = isInQuietHours(options.quietHoursStart, options.quietHoursEnd);
  if (inQuiet) {
    app.log.info(
      { uuid, outdatedIds, quietHoursStart: options.quietHoursStart, quietHoursEnd: options.quietHoursEnd },
      "模组有更新但处于禁更窗，仅记录不下载",
    );
    return {
      success: true,
      message:
        `发现 ${outdatedIds.length} 个模组需更新 (${outdatedIds.join(", ")})，`
        + `当前处于禁更窗 ${options.quietHoursStart}-${options.quietHoursEnd}，已跳过下载`,
      outdatedIds,
      skippedQuietHours: true,
    };
  }

  modUpdateInFlight = true;
  const stoppedUuids: string[] = [];
  const previouslyRunning: string[] = [];
  try {
    const servers = app.configStore.listServers();
    for (const server of servers) {
      const cfg = app.configStore.load(server.uuid);
      const state = app.processManager.getState(server.uuid, cfg ?? undefined);
      if (state.isRunning) {
        previouslyRunning.push(server.uuid);
      }
      const stopResult = await stopServer(app, server.uuid);
      if (!stopResult.success) {
        return {
          success: false,
          message: `停止服务器 ${server.uuid} 失败: ${stopResult.message}`,
          outdatedIds,
          stoppedUuids,
        };
      }
      stoppedUuids.push(server.uuid);
    }

    try {
      await app.steamCmd.downloadWorkshopMods(outdatedIds, (line) => {
        app.log.info({ steamcmd: line.slice(0, 200) }, "mod-update-cron");
      });
    } catch (err) {
      return {
        success: false,
        message: `模组下载失败: ${err instanceof Error ? err.message : String(err)}`,
        outdatedIds,
        stoppedUuids,
      };
    }

    const restartedUuids: string[] = [];
    for (const runningUuid of previouslyRunning) {
      const startResult = await startServer(app, runningUuid);
      if (!startResult.success) {
        return {
          success: false,
          message:
            `模组已更新，但重启 ${runningUuid} 失败: ${startResult.message}`
            + `（已停服: ${stoppedUuids.join(", ")}）`,
          outdatedIds,
          stoppedUuids,
          restartedUuids,
        };
      }
      restartedUuids.push(runningUuid);
    }

    return {
      success: true,
      message:
        `已更新 ${outdatedIds.length} 个模组 (${outdatedIds.join(", ")})；`
        + `已停 ${stoppedUuids.length} 台、重启 ${restartedUuids.length} 台`,
      outdatedIds,
      stoppedUuids,
      restartedUuids,
    };
  } finally {
    modUpdateInFlight = false;
  }
}

/** 供测试重置互斥标志。 */
export function resetModUpdateInFlightForTests(): void {
  modUpdateInFlight = false;
}
