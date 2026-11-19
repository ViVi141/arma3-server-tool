import { ensureDefaultWorkshopScanPath } from "../../mods/paths.js";
import { applySteamCmdSettings } from "../../settings/apply-steamcmd-settings.js";
import { toSteamCmdSettingsView } from "../../settings/steamcmd-settings.js";
import { fetchWorkshopModDetails } from "../../steamcmd/workshop-api.js";
import { resolveConfiguredPath } from "../../util/user-path.js";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import { envelope, parsePositiveInt } from "./shared.js";

export function registerSteamCmdRoutes(app: FastifyInstance): void {
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
      loginMode?: string;
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
      loginMode: body.loginMode as "cached" | "password" | undefined,
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

  app.get("/steamcmd/status", async () => {
    return envelope(true, {
      isRunning: app.steamCmd.isRunning,
      isBusy: app.steamCmd.isBusy,
      isInstalled: app.steamCmd.isInstalled,
      isAborted: app.steamCmd.isAborted,
      loginMode: app.steamCmd.loginMode,
      authState: app.steamCmd.authState,
      hasCredentials: app.steamCmd.hasCredentials,
    }, null, "");
  });

  app.put("/steamcmd/credentials", async (req, reply) => {
    const body = req.body as {
      username?: string;
      password?: string;
      loginMode?: string;
    } | null;
    if (!body?.username) {
      reply.status(400);
      return envelope(false, null, "INVALID_CREDENTIALS", "");
    }
    const loginMode = body.loginMode === "cached" ? "cached" : "password";
    if (loginMode === "password" && !body.password) {
      reply.status(400);
      return envelope(false, null, "INVALID_CREDENTIALS", "");
    }
    app.steamCmd.setLoginMode(loginMode);
    app.steamCmd.setCredentials(body.username, body.password ?? "");
    const merged = app.steamCmdSettingsStore.merge({
      username: body.username,
      password: body.password,
      loginMode,
    });
    applySteamCmdSettings(
      app.steamCmd,
      merged,
      app.modScanPathStore.list().map((entry) => entry.modulePath),
    );
    return envelope(true, {
      message: loginMode === "cached" ? "凭据已设置（缓存登录模式）" : "凭据已设置",
      loginMode,
    }, null, "");
  });

  app.get("/steamcmd/log", async (req) => {
    const query = req.query as { tail?: string };
    const maxLines = parsePositiveInt(query.tail, 300, 10_000);
    const text = await app.steamCmd.getLatestLog(maxLines);
    return envelope(true, { text, source: "aggregated" }, null, "");
  });

  app.post("/steamcmd/stop", async () => {
    app.steamCmd.requestAbort();
    const cancelledTaskIds = app.asyncTaskManager.cancelSteamCmdRelatedRunning();
    return envelope(
      true,
      {
        message: "已取消 SteamCMD 操作，将不再重试",
        cancelledTaskIds,
      },
      null,
      ""
    );
  });
}
