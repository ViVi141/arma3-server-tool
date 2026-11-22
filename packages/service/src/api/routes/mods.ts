import { listMissionFiles, mergeMissionEntries } from "../../missions/scanner.js";
import {
  getServerKeysDirectory,
  type BikeyInspectMode,
} from "../../mods/bikey-service.js";
import { buildModScanOptions, scanModsForConfig } from "../../mods/mod-config-sync.js";
import {
  buildModScanFingerprint,
  getCachedModScan,
  setCachedModScan,
  type ModScanCacheEntry,
} from "../../mods/scan-cache.js";
import { collectModPaths, isModDirectory } from "../../mods/paths.js";
import * as fs from "node:fs";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../../types/config.js";
import { envelope } from "./shared.js";

function resolveBikeyMode(raw: unknown): BikeyInspectMode {
  return raw === "full" ? "full" : "shallow";
}

function loadModScanList(
  app: FastifyInstance,
  uuid: string,
  config: ServerConfigPackage,
  bikeyMode: BikeyInspectMode
): ModScanCacheEntry {
  const modPaths = collectModPaths(app, config);
  const fingerprint = buildModScanFingerprint(
    modPaths,
    bikeyMode,
    true,
    config.server?.serverDir
  );
  const cached = getCachedModScan(uuid, fingerprint, bikeyMode);
  if (cached) {
    return cached;
  }

  // 打开页默认 shallow；?bikeyMode=full 供「扫描刷新」后重载完整签名证据。
  const mods = scanModsForConfig(app, config, {
    serverUuid: uuid,
    skipSize: true,
    bikeyMode,
  });
  const bikeySummary = app.modScanner.summarizeBikeys(
    buildModScanOptions(app, config, { skipSize: true, bikeyMode }),
    mods
  );
  const entry: ModScanCacheEntry = {
    mods,
    scanPathCount: modPaths.length,
    bikeySummary,
    fingerprint,
    cachedAt: Date.now(),
  };
  setCachedModScan(uuid, bikeyMode, entry);
  return entry;
}

export function registerModsRoutes(app: FastifyInstance): void {
  app.get("/servers/:uuid/mods", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }

    const query = req.query as { bikeyMode?: string };
    const bikeyMode = resolveBikeyMode(query.bikeyMode);
    const scan = loadModScanList(app, uuid, config, bikeyMode);
    return envelope(
      true,
      {
        mods: scan.mods,
        scanPathCount: scan.scanPathCount,
        bikeySummary: scan.bikeySummary,
      },
      null,
      uuid
    );
  });

  app.get("/servers/:uuid/mods/bikeys", async (req, reply) => {
    const { uuid } = req.params as { uuid: string };
    const config = app.configStore.load(uuid);
    if (!config) {
      reply.status(404);
      return envelope(false, null, "NOT_FOUND", uuid);
    }

    const scan = loadModScanList(app, uuid, config, "shallow");
    return envelope(true, scan.bikeySummary, null, uuid);
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
}
