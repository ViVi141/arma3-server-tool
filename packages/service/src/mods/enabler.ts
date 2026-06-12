import type { ServerConfigPackage } from "../types/config.js";

export type ModDisableScope = "client" | "server" | "hc" | "all";

export function disableModsByScope(
  config: ServerConfigPackage,
  modIds: number[],
  scope: ModDisableScope
): ServerConfigPackage {
  const ids = new Set(modIds);
  const mods = config.mods ?? {};
  const enabledIds = mods.enabledIds ?? [];
  const serverModIds = mods.serverModIds ?? [];
  const clientModIds = mods.clientModIds ?? [];
  const hcModIds = mods.hcModIds ?? [];

  if (scope === "all") {
    return {
      ...config,
      mods: {
        ...mods,
        enabledIds: enabledIds.filter((id) => !ids.has(id)),
        serverModIds: serverModIds.filter((id) => !ids.has(id)),
        clientModIds: clientModIds.filter((id) => !ids.has(id)),
        hcModIds: hcModIds.filter((id) => !ids.has(id)),
      },
    };
  }

  if (scope === "server") {
    return {
      ...config,
      mods: {
        ...mods,
        serverModIds: serverModIds.filter((id) => !ids.has(id)),
      },
    };
  }

  if (scope === "client") {
    return {
      ...config,
      mods: {
        ...mods,
        clientModIds: clientModIds.filter((id) => !ids.has(id)),
      },
    };
  }

  return {
    ...config,
    mods: {
      ...mods,
      hcModIds: hcModIds.filter((id) => !ids.has(id)),
    },
  };
}

export function resolveModPaths(config: ServerConfigPackage, globalPaths: string[]): string[] {
  const paths = new Set<string>();
  for (const p of config.server?.modPaths ?? []) {
    if (p) {
      paths.add(p);
    }
  }
  for (const p of config.mods?.modPaths ?? []) {
    if (p) {
      paths.add(p);
    }
  }
  for (const p of globalPaths) {
    if (p) {
      paths.add(p);
    }
  }
  return [...paths];
}
