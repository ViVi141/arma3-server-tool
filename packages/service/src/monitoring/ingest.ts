import type { MonitoringDb } from "./db.js";

export function ingestMonitoringMessage(db: MonitoringDb, serverUuid: string, raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed) {
    return;
  }

  const parts = trimmed.split("|");
  if (parts.length === 0) {
    return;
  }

  const header = parts[0].split(":");
  const messageType = header[0]?.trim() ?? "";

  if (messageType === "ObjectManipulationNum" && parts.length > 1) {
    const args = parts[1].split(":");
    const playerCount = parseInt(args[2] ?? "0", 10);
    const fps = parseFloat(args[17] ?? "");
    const fpsValue = Number.isFinite(fps) ? fps : undefined;
    db.recordStats(serverUuid, Number.isFinite(playerCount) ? playerCount : 0, fpsValue);
    return;
  }

  if (messageType === "PlayerInfo" && parts.length > 1) {
    const args = parts[1].split(":");
    const guid = args[0]?.trim();
    const name = args[1]?.trim();
    if (guid && name) {
      db.recordPlayer({
        playerGuid: guid,
        playerName: name,
        serverUuid,
        lastSeen: new Date().toISOString(),
      });
    }
  }
}
