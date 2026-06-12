import * as fs from "node:fs";
import * as path from "node:path";
import type { ServerConfigPackage } from "../types/config.js";
import { serverCfgExists, serverCfgPath } from "./game-config-writer.js";

export interface ServerSyncState {
  lastModified: string | null;
  cfgWritten: boolean;
  cfgStale: boolean;
}

export function evaluateSyncState(
  dataDir: string,
  uuid: string,
  config: ServerConfigPackage | null
): ServerSyncState {
  const manifestPath = path.join(dataDir, "config", uuid, "manifest.json");
  let lastModified: string | null = null;

  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as {
        lastModified?: string;
      };
      lastModified = manifest.lastModified ?? null;
    } catch {
      lastModified = null;
    }
  }

  const serverDir = config?.server?.serverDir;
  if (!serverDir) {
    return { lastModified, cfgWritten: false, cfgStale: false };
  }

  const cfgWritten = serverCfgExists(serverDir, uuid);
  if (!cfgWritten || !lastModified) {
    return { lastModified, cfgWritten, cfgStale: false };
  }

  try {
    const cfgMtime = fs.statSync(serverCfgPath(serverDir, uuid)).mtimeMs;
    const savedMs = new Date(lastModified).getTime();
    return {
      lastModified,
      cfgWritten,
      cfgStale: savedMs > cfgMtime,
    };
  } catch {
    return { lastModified, cfgWritten, cfgStale: false };
  }
}
