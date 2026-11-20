import type { ServerConfigPackage } from "../types/config.js";

/** Arma 3 dedicated server default game port. */
export const DEFAULT_GAME_PORT = 2302;

/** Resolve the UDP game port the server actually listens on. */
export function resolveArmaGamePort(
  config: ServerConfigPackage | null | undefined
): number {
  const startup = (config?.startup ?? {}) as Record<string, unknown>;
  const basic = (config?.basic ?? {}) as Record<string, unknown>;
  const raw = Number(startup.port ?? basic.port ?? DEFAULT_GAME_PORT);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 65535) {
    return DEFAULT_GAME_PORT;
  }
  return Math.trunc(raw);
}

function offsetPort(gamePort: number): number {
  if (gamePort < 65535) {
    return gamePort + 1;
  }
  return gamePort > 1 ? gamePort - 1 : DEFAULT_GAME_PORT;
}

/**
 * Effective BattlEye RCon port.
 *
 * BattlEye requires `RConPort` to differ from the game port; pointing it at
 * the game port silently disables RCon (the game socket owns that port). This
 * helper is shared by the cfg writer and the RCon client so both sides always
 * agree on the same value, even for legacy configs saved with the game port.
 */
export function resolveEffectiveRconPort(
  config: ServerConfigPackage | null | undefined
): number {
  const gamePort = resolveArmaGamePort(config);
  const configured = Number(config?.battleye?.rconPort);
  if (!Number.isFinite(configured) || configured <= 0 || configured > 65535) {
    return offsetPort(gamePort);
  }
  const port = Math.trunc(configured);
  return port === gamePort ? offsetPort(gamePort) : port;
}
