import { resolveEffectiveRconPort } from "../config/rcon-port.js";
import { isRconCoolingDown, recordRconPlayers, withRconClient, getCachedOnlineCount } from "./session.js";
import type { ServerConfigPackage } from "../types/config.js";
import type { RconPlayer } from "../types/rcon.js";

export interface RconOptions {
  host: string;
  port: number;
  password: string;
}

export function resolveRconOptions(config: ServerConfigPackage): RconOptions | null {
  const password = config.battleye?.rconPassword;
  if (!password) {
    return null;
  }

  const battleye = config.battleye as Record<string, unknown> | undefined;
  const host = String(battleye?.rconHost ?? "127.0.0.1");
  // BattlEye RCon listens on its own port; sharing the game port silently
  // disables it. Mirrors the value written into BEServer*.cfg.
  const port = resolveEffectiveRconPort(config);

  return { host, port, password };
}

/** Session key for callers that do not track a server uuid. */
const DEFAULT_SESSION_UUID = "__default__";

/**
 * Read the player list over a shared RCon session. Repeated calls (dashboard,
 * monitoring, kick actions) reuse one BattlEye login instead of reconnecting.
 */
export async function fetchRconPlayers(
  config: ServerConfigPackage,
  uuid: string = DEFAULT_SESSION_UUID
): Promise<RconPlayer[]> {
  const options = resolveRconOptions(config);
  if (!options) {
    throw new Error("未配置 RCon，在线人数未知");
  }

  const players = await withRconClient(
    uuid,
    { ...options, timeout: 5000 },
    (client) => client.getPlayers()
  );
  recordRconPlayers(uuid, players);
  return players;
}

export interface RconPlayerSnapshot {
  ok: boolean;
  players: RconPlayer[];
}

/**
 * Single round-trip used by background collectors: the player count and the
 * names come from the same response, so one tick costs at most one login.
 */
export async function collectRconPlayers(
  uuid: string,
  config: ServerConfigPackage
): Promise<RconPlayerSnapshot> {
  if (!resolveRconOptions(config) || isRconCoolingDown(uuid)) {
    return { ok: false, players: [] };
  }
  try {
    const players = await fetchRconPlayers(config, uuid);
    return { ok: true, players };
  } catch {
    return { ok: false, players: [] };
  }
}

export async function countOnlinePlayers(
  config: ServerConfigPackage,
  uuid: string = DEFAULT_SESSION_UUID
): Promise<number | null> {
  if (isRconCoolingDown(uuid)) {
    return null;
  }
  try {
    const players = await fetchRconPlayers(config, uuid);
    return players.length;
  } catch {
    return null;
  }
}

export { getCachedOnlineCount };
