import { createHash } from "node:crypto";
import { RconClient, type RconClientOptions } from "./client.js";
import type { RconPlayer } from "../types/rcon.js";

/** Disconnect a session after this long without any command. */
const IDLE_DISCONNECT_MS = 5 * 60_000;
/** Background pollers back off this long after a failed login/command. */
const FAILURE_COOLDOWN_MS = 60_000;

interface RconSessionEntry {
  /** host:port:password the client was created with. */
  key: string;
  client: RconClient;
  /** Serializes commands so one UDP session is never used concurrently. */
  queue: Promise<unknown>;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export interface RconOnlineSnapshot {
  onlineCount: number;
  at: number;
}

const sessions = new Map<string, RconSessionEntry>();
const failureCooldowns = new Map<string, number>();
/** Latest known player list per server, independent of session lifetime. */
const playerSnapshots = new Map<string, { players: RconPlayer[]; at: number }>();

function sessionKey(options: RconClientOptions): string {
  // Hash the password so Maps / core dumps do not retain the plaintext secret.
  const passwordDigest = createHash("sha256")
    .update(options.password, "utf8")
    .digest("hex")
    .slice(0, 16);
  return `${options.host}:${options.port}:${passwordDigest}`;
}

function destroyEntry(uuid: string, entry: RconSessionEntry): void {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
  }
  entry.client.disconnect();
  if (sessions.get(uuid) === entry) {
    sessions.delete(uuid);
  }
}

function scheduleIdleDisconnect(uuid: string, entry: RconSessionEntry): void {
  if (entry.idleTimer) {
    clearTimeout(entry.idleTimer);
  }
  entry.idleTimer = setTimeout(() => {
    destroyEntry(uuid, entry);
  }, IDLE_DISCONNECT_MS);
  entry.idleTimer.unref?.();
}

function acquire(uuid: string, options: RconClientOptions): RconSessionEntry {
  const key = sessionKey(options);
  const existing = sessions.get(uuid);
  if (existing && existing.key === key) {
    scheduleIdleDisconnect(uuid, existing);
    return existing;
  }
  if (existing) {
    // host/port/password changed: never reuse the stale login.
    destroyEntry(uuid, existing);
  }
  const entry: RconSessionEntry = {
    key,
    client: new RconClient({ ...options, timeout: options.timeout ?? 5000 }),
    queue: Promise.resolve(),
    idleTimer: null,
  };
  sessions.set(uuid, entry);
  scheduleIdleDisconnect(uuid, entry);
  return entry;
}

function markFailure(uuid: string): void {
  failureCooldowns.set(uuid, Date.now() + FAILURE_COOLDOWN_MS);
}

function markSuccess(uuid: string): void {
  failureCooldowns.delete(uuid);
}

/**
 * True while a background poller should skip RCon entirely. User-initiated
 * actions (RCon page, kick/ban) ignore this and always attempt a login.
 */
export function isRconCoolingDown(uuid: string): boolean {
  const until = failureCooldowns.get(uuid) ?? 0;
  if (until <= Date.now()) {
    failureCooldowns.delete(uuid);
    return false;
  }
  return true;
}

/**
 * Run `fn` against a long-lived, per-server RCon client.
 *
 * BattlEye records every login as a new RCon admin, so callers must share one
 * session instead of dialing in on every poll. Calls are serialized per server,
 * and a command that fails on an established session (server restart, silent
 * UDP drop) is retried once against a rebuilt session.
 */
export async function withRconClient<T>(
  uuid: string,
  options: RconClientOptions,
  fn: (client: RconClient) => Promise<T>
): Promise<T> {
  const head = acquire(uuid, options);
  const run = async (): Promise<T> => {
    // Re-acquire inside the queued task: an earlier task may have replaced the
    // session after a failure while this call was waiting in line.
    const entry = acquire(uuid, options);
    const hadSession = entry.client.connected;
    try {
      if (!entry.client.connected) {
        await entry.client.connect();
      }
      const result = await fn(entry.client);
      markSuccess(uuid);
      return result;
    } catch (error) {
      destroyEntry(uuid, entry);
      markFailure(uuid);
      if (!hadSession) {
        // A fresh login already consumed its full timeout: do not double it.
        throw error;
      }
      const rebuilt = acquire(uuid, options);
      if (!rebuilt.client.connected) {
        await rebuilt.client.connect();
      }
      const result = await fn(rebuilt.client);
      markSuccess(uuid);
      return result;
    } finally {
      const current = sessions.get(uuid);
      if (current) {
        scheduleIdleDisconnect(uuid, current);
      }
    }
  };

  const task = head.queue.then(run, run);
  head.queue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

/** Cache the latest known player list for cheap dashboard reads. */
export function recordRconPlayers(uuid: string, players: RconPlayer[]): void {
  playerSnapshots.set(uuid, { players, at: Date.now() });
}

export function getCachedOnlineCount(uuid: string): RconOnlineSnapshot | null {
  const snapshot = playerSnapshots.get(uuid);
  if (!snapshot) {
    return null;
  }
  return { onlineCount: snapshot.players.length, at: snapshot.at };
}

/** Drop a server's session (stop/restart) so the next call logs in fresh. */
export function dropRconSession(uuid: string): void {
  const entry = sessions.get(uuid);
  if (entry) {
    destroyEntry(uuid, entry);
  }
  failureCooldowns.delete(uuid);
  playerSnapshots.delete(uuid);
}

/** Close every session; used on service shutdown and in tests. */
export function closeAllRconSessions(): void {
  for (const [uuid, entry] of Array.from(sessions.entries())) {
    destroyEntry(uuid, entry);
  }
  failureCooldowns.clear();
  playerSnapshots.clear();
}
