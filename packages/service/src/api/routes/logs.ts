import { describeRptSearch } from "../../logs/reader.js";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import { envelope, parsePositiveInt } from "./shared.js";

export function registerLogsRoutes(app: FastifyInstance): void {
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
    const kind = (query.kind ?? "all") as "rpt" | "battleye" | "console" | "all";
    const files = app.rptLogReader.listLogs(config.server.serverDir, uuid, kind).map((item) => ({
      fileName: item.fileName,
      filePath: item.filePath,
      size: item.size,
      lastModified: item.lastModified.toISOString(),
      kind: item.kind,
    }));
    // 找不到 RPT 时，把"搜过哪些目录、是否存在、以及是否被 -noLogs 关闭"一并回给界面，
    // 运维能据此判断是参数问题、权限问题还是服务器根本没起来。
    const basic = (config.basic ?? {}) as Record<string, unknown>;
    const noLogs = basic.noLogs === true || basic.noLogs === 1 || basic.noLogs === "true";
    return envelope(
      true,
      {
        kind,
        serverDir: config.server.serverDir,
        files,
        noLogs,
        searchedDirs: kind === "rpt" || kind === "all" ? describeRptSearch(config.server.serverDir, uuid) : [],
      },
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
    const kind = (query.kind ?? "rpt") as "rpt" | "battleye" | "console" | "all";
    const maxLines = parsePositiveInt(query.tail, 200, 10_000);
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
}
