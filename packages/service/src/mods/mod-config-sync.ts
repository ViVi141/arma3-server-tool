import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";
import type { BikeyInspectMode } from "./bikey-service.js";
import { collectModPaths } from "./paths.js";
import { refreshConfigModParameters } from "./mod-startup-sync.js";
import { recordSignatureEvents } from "../operations/source-events.js";

export type ModScanExtra = {
  skipSize?: boolean;
  serverUuid?: string;
  bikeyMode?: BikeyInspectMode;
};

export function buildModScanOptions(
  app: FastifyInstance,
  config: ServerConfigPackage,
  extra?: ModScanExtra
) {
  const modPaths = collectModPaths(app, config);
  return {
    modPaths,
    scanPathEntries: app.modScanPathStore.list(),
    enabledIds: config.mods?.enabledIds ?? [],
    serverModIds: config.mods?.serverModIds ?? [],
    clientModIds: config.mods?.clientModIds ?? [],
    hcModIds: config.mods?.hcModIds ?? [],
    roleEntries: config.mods?.roleEntries ?? [],
    localMods: config.mods?.localMods ?? [],
    enabledLocalPaths: config.mods?.enabledLocalPaths ?? [],
    serverDir: config.server?.serverDir,
    skipSize: extra?.skipSize,
    bikeyMode: extra?.bikeyMode ?? "shallow",
  };
}

export function scanModsForConfig(
  app: FastifyInstance,
  config: ServerConfigPackage,
  extra?: ModScanExtra
) {
  const mods = app.modScanner.scan(buildModScanOptions(app, config, extra));
  if (extra?.serverUuid) recordSignatureEvents(app, extra.serverUuid, mods);
  return mods;
}

export function refreshConfigModParametersFromApp(
  app: FastifyInstance,
  config: ServerConfigPackage
): ServerConfigPackage {
  return refreshConfigModParameters(config);
}

export function syncRoleEntriesFromIds(config: ServerConfigPackage): ServerConfigPackage {
  const entries = config.mods?.roleEntries ?? [];
  if (!entries.length) {
    return config;
  }

  const clientIds = new Set(config.mods?.clientModIds ?? []);
  const serverIds = new Set(config.mods?.serverModIds ?? []);
  const hcIds = new Set(config.mods?.hcModIds ?? []);

  const roleEntries = entries.map((entry) => ({
    ...entry,
    isClientMod: clientIds.has(entry.workshopId),
    isServerMod: serverIds.has(entry.workshopId),
    isHcMod: hcIds.has(entry.workshopId),
  }));

  return {
    ...config,
    mods: {
      ...config.mods,
      roleEntries,
    },
  };
}
