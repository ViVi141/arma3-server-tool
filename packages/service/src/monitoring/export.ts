import type { MonitoringDb, StatsRecord } from "./db.js";

export function buildDailyHtmlReport(
  configName: string,
  serverUuid: string,
  stats: StatsRecord[]
): string {
  const rows = stats
    .map((point) => {
      const fpsText = point.serverFps != null ? String(Math.round(point.serverFps)) : "-";
      return `<tr><td>${escapeHtml(point.timestamp)}</td><td>${point.playerCount}</td><td>${fpsText}</td></tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(configName)} 统计日报</title>
  <style>
    body { font-family: sans-serif; margin: 24px; }
    h1 { font-size: 20px; }
    table { border-collapse: collapse; width: 100%; margin-top: 16px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f5f5f5; }
  </style>
</head>
<body>
  <h1>${escapeHtml(configName)} 统计日报</h1>
  <p>服务器 UUID: ${escapeHtml(serverUuid)}</p>
  <p>生成时间: ${new Date().toISOString()}</p>
  <table>
    <thead><tr><th>时间</th><th>在线人数</th><th>FPS</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</body>
</html>`;
}

export function buildStatsCsv(stats: StatsRecord[]): string {
  const lines = ["timestamp,player_count,server_fps"];
  for (const point of stats) {
    const fps = point.serverFps != null ? String(point.serverFps) : "";
    lines.push(`${point.timestamp},${point.playerCount},${fps}`);
  }
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

export function buildPlayersCsv(
  players: ReturnType<MonitoringDb["listPlayers"]>
): string {
  const lines = ["guid,name,last_seen"];
  for (const player of players) {
    lines.push(`${csvEscape(player.playerGuid)},${csvEscape(player.playerName)},${csvEscape(player.lastSeen)}`);
  }
  return `\ufeff${lines.join("\r\n")}\r\n`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
