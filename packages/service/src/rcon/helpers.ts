import { RconClient } from "./client.js";
import type { ServerConfigPackage } from "../types/config.js";
import type { RconPlayer } from "../types/rcon.js";

export function resolveRconOptions(config: ServerConfigPackage): {
  host: string;
  port: number;
  password: string;
} | null {
  const password = config.battleye?.rconPassword;
  if (!password) {
    return null;
  }

  const battleye = config.battleye as Record<string, unknown> | undefined;
  const host = String(battleye?.rconHost ?? "127.0.0.1");
  const port = config.battleye?.rconPort ?? 2302;

  return { host, port, password };
}

export async function fetchRconPlayers(config: ServerConfigPackage): Promise<RconPlayer[]> {
  const options = resolveRconOptions(config);
  if (!options) {
    return [];
  }

  const client = new RconClient({ ...options, timeout: 5000 });
  try {
    await client.connect();
    return await client.getPlayers();
  } finally {
    client.disconnect();
  }
}

export async function countOnlinePlayers(config: ServerConfigPackage): Promise<number | null> {
  try {
    const players = await fetchRconPlayers(config);
    return players.length;
  } catch {
    return null;
  }
}
