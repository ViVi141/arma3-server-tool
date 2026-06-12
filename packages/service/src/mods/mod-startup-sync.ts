import type { ServerConfigPackage } from "../types/config.js";

/** Mod startup params are built at launch time in buildStartCommandLine (C# parity). */
export function refreshConfigModParameters(config: ServerConfigPackage): ServerConfigPackage {
  return config;
}
