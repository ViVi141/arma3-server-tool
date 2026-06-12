import type { FastifyInstance } from "fastify";
import type { ServerConfigPackage } from "../types/config.js";
import { collectModPaths } from "./paths.js";
import { refreshConfigModParameters } from "./mod-startup-sync.js";

export function buildModScanOptions(app: FastifyInstance, config: ServerConfigPackage) {
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
  };
}

export function scanModsForConfig(app: FastifyInstance, config: ServerConfigPackage) {
  return app.modScanner.scan(buildModScanOptions(app, config));
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
