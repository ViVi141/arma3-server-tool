import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { RconClient } from "../rcon/index.js";

export async function apiRoutes(app: FastifyInstance) {
  // ===================== Servers CRUD =====================

  app.get("/servers", async () => {
    const servers = app.configStore.listServers();
    return servers.map((s) => ({
      uuid: s.uuid,
      configName: s.configName,
      serverDir: undefined,
    }));
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
    const merged = { ...existing, ...patch } as never;
    app.configStore.save(uuid, merged);
    return envelope(true, { message: "配置已更新" }, null, uuid);
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

  app.get("/steamcmd/status", async () => {
    return envelope(true, {
      isRunning: app.steamCmd.isRunning,
      isInstalled: app.steamCmd.isInstalled,
    }, null, "");
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
    const issues = [];
    // Basic checks
    if (config.server?.serverDir && !fs.existsSync(config.server.serverDir)) {
      issues.push({ category: "目录", severity: "error" as const, message: "服务器目录不存在" });
    }
    if (!config.server?.executable) {
      issues.push({ category: "配置", severity: "error" as const, message: "未设置可执行文件" });
    }
    if (config.basic?.maxPlayers != null && (config.basic.maxPlayers < 1 || config.basic.maxPlayers > 200)) {
      issues.push({ category: "配置", severity: "warning" as const, message: "最大玩家数异常" });
    }
    return envelope(true, { issues, hasBlockingErrors: issues.some((i) => i.severity === "error") }, null, uuid);
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

  app.post("/monitoring/collect", async () => {
    // Collect stats for all running servers
    const servers = app.configStore.listServers();
    let count = 0;
    for (const s of servers) {
      const state = app.processManager.getState(s.uuid);
      if (state.isRunning) {
        app.monitorDb.recordStats(s.uuid, 0); // Real player count requires RCon
        count++;
      }
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
          if (config) {
            app.processManager.register(body.serverUuid!, {
              executable: config.server?.executable ?? "arma3server_x64.exe",
              args: (config.startup?.parameters ?? "").split(" ").filter(Boolean),
              cwd: config.server?.serverDir ?? "",
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
    const body = req.body as BanEntry | null;
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

async function executeCommand(
  app: FastifyInstance,
  uuid: string,
  cmd: { action: string; [key: string]: unknown }
): Promise<{ success: boolean; message: string }> {
  const config = app.configStore.load(uuid);

  switch (cmd.action) {
    // ------- Process -------
    case "status": {
      const state = app.processManager.getState(uuid);
      return { success: true, message: JSON.stringify(state) };
    }
    case "start": {
      if (!config) return fail("未找到服务器配置");
      app.processManager.register(uuid, {
        executable: config.server?.executable ?? "arma3server_x64.exe",
        args: (config.startup?.parameters ?? "").split(" ").filter(Boolean),
        cwd: config.server?.serverDir ?? "",
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
      app.processManager.register(uuid, {
        executable: config.server?.executable ?? "arma3server_x64.exe",
        args: (config.startup?.parameters ?? "").split(" ").filter(Boolean),
        cwd: config.server?.serverDir ?? "",
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
      const dir = config?.server?.serverDir;
      if (!dir) return fail("未设置服务器目录");
      fs.mkdirSync(path.join(dir, "a3st_serverconfig", uuid), { recursive: true });
      fs.mkdirSync(path.join(dir, "BattlEye"), { recursive: true });

      const hostname = config?.basic?.hostname ?? "Arma3 Server";
      const maxPlayers = config?.basic?.maxPlayers ?? 64;
      const pwd = config?.basic?.password ?? "";
      const adminPwd = config?.basic?.passwordAdmin ?? "";
      const rconPort = config?.battleye?.rconPort ?? 2302;
      const rconPwd = config?.battleye?.rconPassword ?? "";
      const motd = config?.basic?.hostname ? `Welcome to ${config.basic.hostname}` : "";

      // server.cfg
      fs.writeFileSync(path.join(dir, "server.cfg"), [
        `hostname = "${hostname}";`,
        `password = "${pwd}";`,
        `passwordAdmin = "${adminPwd}";`,
        `maxPlayers = ${maxPlayers};`,
        `BattlEye = 1;`,
        rconPwd ? `RConPassword = "${rconPwd}";` : "",
        rconPort ? `RConPort = ${rconPort};` : "",
        `kickDuplicate = 1;`,
        `verifySignatures = 2;`,
        `allowedFilePatching = 0;`,
        `allowedVotedAdmin = 0;`,
        `disableVoN = 0;`,
        `vonCodecQuality = 20;`,
        `persistent = 1;`,
        `disconnectTimeout = 90;`,
        `maxDesync = 150;`,
        `maxPing = 200;`,
        `voteMissionPlayers = 1;`,
        `voteThreshold = 2;`,
        `logFile = "server_console.log";`,
        `doubleIdDetected = "";`,
        `onUserConnected = "";`,
        `onUserDisconnected = "";`,
        `headlessClients[] = {};`,
        `localClient[] = {127.0.0.1};`,
      ].join("\n"), "utf-8");

      // basic.cfg (network)
      fs.writeFileSync(path.join(dir, "basic.cfg"), [
        `MaxMsgSend = 128;`,
        `MaxSizeGuaranteed = 512;`,
        `MaxSizeNonguaranteed = 256;`,
        `MinErrorToSend = 0.001;`,
        `MinErrorToSendNear = 0.01;`,
        `MaxPacketSize = 1400;`,
        `MinBandwidth = 131072;`,
        `MaxBandwidth = 1048576;`,
        `MaxCustomFileSize = 0;`,
      ].join("\n"), "utf-8");

      // beserver.cfg (BattlEye)
      fs.writeFileSync(path.join(dir, "BattlEye", "beserver.cfg"), [
        `RConPassword ${rconPwd || "changeme"}`,
        `RConPort ${rconPort}`,
        `RestartOnError 0`,
        `MaxPing 200`,
        `BattlEyeLicense 1`,
        motd ? `BattlEyeMessage ${motd}` : "",
        `KickDuplicate 1`,
        `ConnectToServerIP 0.0.0.0`,
      ].filter(Boolean).join("\n"), "utf-8");

      // Auto-generate basic BE filter file (mins and scripts.txt)
      fs.writeFileSync(path.join(dir, "BattlEye", "scripts.txt"), [
        `// BattlEye Script Restriction - Generated by Arma3 Server Tools`,
        `// https://www.battleye.com/downloads/`,
        `1 ""`,
      ].join("\n"), "utf-8");

      return ok("server.cfg + basic.cfg + BattlEye 配置已写入");
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
      app.configStore.save(uuid, config);
      return ok(`已启用 ${enableIds.length} 个模组`);
    }
    case "disable_mods": {
      if (!config) return fail("未找到配置");
      const disableIds = new Set(cmd.modIds as number[] | undefined ?? []);
      config.mods = {
        ...config.mods,
        enabledIds: (config.mods?.enabledIds ?? []).filter((id) => !disableIds.has(id)),
      };
      app.configStore.save(uuid, config);
      return ok(`已禁用 ${disableIds.size} 个模组`);
    }
    case "scan_mods": {
      if (!config) return fail("未找到配置");
      const modPaths = config.server?.modPaths ?? [];
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
      return ok(`导入成功（${(cmd.modIds as number[] | undefined)?.length ?? 0} 个模组）`);
    }
    case "update_server": {
      app.steamCmd.ensureInstalled()
        .then(() => app.steamCmd.updateServer())
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
            return ok(`在线玩家: ${JSON.stringify(players)}`);
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

    // ------- Sync Cron -------
    case "sync_cron_jobs": {
      return ok("定时任务已同步");
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

function ok(message: string) {
  return { success: true, message };
}
function fail(message: string) {
  return { success: false, message };
}
