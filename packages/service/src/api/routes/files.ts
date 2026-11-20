import { maybeAutoSnapshot } from "../../config/auto-snapshot.js";
import { maintenanceLocks } from "../../maintenance/locks.js";
import { writeAll } from "../../config/game-config-writer.js";
import { buildModImportPreview, normalizeModImportMode, shouldDownloadForMode } from "../../mods/import-modes.js";
import { scanModsForConfig } from "../../mods/mod-config-sync.js";
import { collectModPaths } from "../../mods/paths.js";
import { assertMissionPboFileName, assertSafeTargetPath, MISSION_PBO_MAX_BYTES } from "../../util/upload-safety.js";
import * as fs from "node:fs";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import { envelope, parseQueryBool } from "./shared.js";
import { executeCommand } from "./task-commands.js";

export function registerFilesRoutes(app: FastifyInstance): void {
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
      html = typeof req.body === "string" ? req.body : "";
    }

    if (!html.trim()) {
      reply.status(400);
      return envelope(false, null, "NO_CONTENT", uuid);
    }

    // Parse IDs from HTML
    const ids = [...html.matchAll(/(\d{7,})/g)].map((m) => parseInt(m[1], 10));
    const mode = normalizeModImportMode(query.mode ?? "download_and_enable");
    const writeCfg = query.writeCfg === "true";

    const result = await executeCommand(app, uuid, {
      action: "import_mods_html",
      modIds: ids,
      mode,
      writeCfgAfter: writeCfg,
    } as never);

    if (!result.success) {
      reply.status(400);
    }
    return envelope(result.success, {
      success: result.success,
      message: result.message,
      modCount: ids.length,
      mode,
      requiresSteamCmd: shouldDownloadForMode(mode),
    }, result.success ? null : result.message, uuid);
  });

  app.post("/servers/:uuid/mods/import-preview", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const body = req.body as { modIds?: number[]; mode?: string } | null;
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }
    const ids = body?.modIds ?? [];
    if (!ids.length) {
      reply.status(400);
      return envelope(false, null, "NO_MOD_IDS", uuid);
    }
    const mode = normalizeModImportMode(body?.mode);
    let installedIds: number[] = [];
    try {
      if (collectModPaths(app, config).length) {
        installedIds = scanModsForConfig(app, config, { skipSize: true })
          .filter((m) => m.workshopId > 0 && m.path)
          .map((m) => m.workshopId);
      }
    } catch (err) {
      // 扫描失败不应阻塞导入预览，但需留痕便于排查模组目录异常。
      req.log.warn({ err, uuid }, "扫描已安装模组失败，按空列表继续");
      installedIds = [];
    }
    const preview = buildModImportPreview(
      ids,
      config.mods?.enabledIds ?? [],
      installedIds,
      mode,
    );
    return envelope(true, preview, null, uuid);
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

    let safeName: string;
    let fullPath: string;
    try {
      safeName = assertMissionPboFileName(data.filename);
      const mpmDir = path.join(config.server.serverDir, "MPMissions");
      maintenanceLocks.assertAvailable({ instances: [uuid], paths: [{ path: path.resolve(mpmDir), mode: "write" }] });
      fs.mkdirSync(mpmDir, { recursive: true });
      fullPath = assertSafeTargetPath(mpmDir, safeName);
    } catch (err) {
      reply.status(400);
      return envelope(false, null, err instanceof Error ? err.message : "INVALID_FILE", uuid);
    }

    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of data.file) {
      total += chunk.length;
      if (total > MISSION_PBO_MAX_BYTES) {
        reply.status(413);
        return envelope(
          false,
          null,
          `文件超过 ${MISSION_PBO_MAX_BYTES / (1024 * 1024)} MiB 限制`,
          uuid,
        );
      }
      chunks.push(chunk);
    }

    const sharedDirs = app.configStore.listServers().filter((server) => {
      if (server.uuid === uuid) {
        return false;
      }
      const other = app.configStore.load(server.uuid);
      return Boolean(
        other?.server?.serverDir
        && path.resolve(other.server.serverDir) === path.resolve(config.server!.serverDir!),
      );
    });
    // 上传流读取期间可能开始维护，必须在实际写入前重新检查。
    maintenanceLocks.assertAvailable({ instances: [uuid], paths: [{ path: path.resolve(fullPath), mode: "write" }] });
    const overwrite = fs.existsSync(fullPath);
    fs.writeFileSync(fullPath, Buffer.concat(chunks));

    if (parseQueryBool(query.addToMissionList)) {
      const template = path.basename(safeName, path.extname(safeName));
      const missions = config.tasks?.missions ?? [];
      if (!missions.some((m) => m.template === template)) {
        missions.push({ template, difficulty: 3 });
      }
      config.tasks = { ...config.tasks, missions };
      app.configStore.save(uuid, config);
    }

    let cfgWritten = false;
    let writeCfgMessage: string | undefined;
    if (parseQueryBool(query.writeCfg)) {
      maybeAutoSnapshot(app, uuid, "write");
      const writeResult = writeAll(uuid, config);
      if (!writeResult.success) {
        reply.status(400);
        return envelope(false, { message: writeResult.message }, "WRITE_CFG_FAILED", uuid);
      }
      cfgWritten = true;
      writeCfgMessage = writeResult.message;
    }

    return envelope(true, {
      template: path.basename(safeName, ".pbo"),
      fullPath,
      fileName: safeName,
      sizeBytes: total,
      maxBytes: MISSION_PBO_MAX_BYTES,
      overwritten: overwrite,
      cfgWritten,
      writeCfgMessage,
      sharedServerWarning: sharedDirs.length
        ? `该 MPMissions 目录与另外 ${sharedDirs.length} 台服务器共享，覆盖会影响它们`
        : null,
      note: "上传不等于切换任务或重启服务器",
    }, null, uuid);
  });
}
