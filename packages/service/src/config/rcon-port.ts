import type { ServerConfigPackage } from "../types/config.js";

/** Arma 3 dedicated server default game port. */
export const DEFAULT_GAME_PORT = 2302;

/**
 * Offsets from the game port that Arma / Steam / BattlEye already bind.
 * RCon must not share these or the login handshake times out with no reply.
 *
 * | +0 | game / VON |
 * | +1 | Steam query |
 * | +2 | Steam |
 * | +4 | BattlEye game traffic |
 *
 * Preferred default is +3 (e.g. 2305 when the game uses 2302).
 */
const RESERVED_PORT_OFFSETS = [0, 1, 2, 4] as const;
const PREFERRED_RCON_OFFSET = 3;

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

function clampPort(port: number): number {
  if (port < 1) {
    return 1;
  }
  if (port > 65535) {
    return 65535;
  }
  return port;
}

function reservedPorts(gamePort: number): Set<number> {
  const reserved = new Set<number>();
  for (const offset of RESERVED_PORT_OFFSETS) {
    reserved.add(clampPort(gamePort + offset));
  }
  return reserved;
}

/** Pick a free RCon port near the game port (prefer +3). */
export function pickAvailableRconPort(gamePort: number): number {
  const reserved = reservedPorts(gamePort);
  const preferred = clampPort(gamePort + PREFERRED_RCON_OFFSET);
  if (!reserved.has(preferred)) {
    return preferred;
  }
  for (let delta = 1; delta <= 32; delta++) {
    const up = clampPort(gamePort + delta);
    if (!reserved.has(up)) {
      return up;
    }
    const down = clampPort(gamePort - delta);
    if (!reserved.has(down)) {
      return down;
    }
  }
  return preferred;
}

/**
 * Effective BattlEye RCon port.
 *
 * Shared by the cfg writer and the RCon client so both sides always agree.
 * Legacy configs that point RCon at the game / Steam / BE ports are remapped
 * to a free port (default game+3).
 */
export function resolveEffectiveRconPort(
  config: ServerConfigPackage | null | undefined
): number {
  const gamePort = resolveArmaGamePort(config);
  const configured = Number(config?.battleye?.rconPort);
  if (!Number.isFinite(configured) || configured <= 0 || configured > 65535) {
    return pickAvailableRconPort(gamePort);
  }
  const port = Math.trunc(configured);
  if (reservedPorts(gamePort).has(port)) {
    return pickAvailableRconPort(gamePort);
  }
  return port;
}
