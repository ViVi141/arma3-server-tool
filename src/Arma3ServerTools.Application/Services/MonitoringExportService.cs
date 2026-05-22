using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class MonitoringTimelinePoint
    {
        public long TimestampUnix { get; set; }

        public string CreateTime { get; set; } = string.Empty;

        public int AllPlayers { get; set; }

        public int Fps { get; set; }

        public int FpsMin { get; set; }
    }

    public sealed class MonitoringKillLeaderEntry
    {
        public string PlayerName { get; set; } = string.Empty;

        public int TotalKills { get; set; }
    }

    public static class MonitoringChartDataBuilder
    {
        public static IReadOnlyList<MonitoringTimelinePoint> BuildTimeline(
            IReadOnlyList<MonitoringObjectStatRecord> rows)
        {
            var points = new List<MonitoringTimelinePoint>();
            if (rows == null)
            {
                return points;
            }

            for (int i = 0; i < rows.Count; i++)
            {
                MonitoringObjectStatRecord row = rows[i];
                points.Add(
                    new MonitoringTimelinePoint
                    {
                        TimestampUnix = row.CreateTimeTimestamp,
                        CreateTime = row.CreateTime ?? string.Empty,
                        AllPlayers = row.AllPlayers,
                        Fps = row.Fps,
                        FpsMin = row.FpsMin,
                    });
            }

            return points;
        }

        public static IReadOnlyList<MonitoringKillLeaderEntry> BuildTopKillLeaders(
            IReadOnlyList<MonitoringPlayerStatRecord> rows,
            int topCount)
        {
            var leaders = new List<MonitoringKillLeaderEntry>();
            if (rows == null || topCount < 1)
            {
                return leaders;
            }

            int count = Math.Min(topCount, rows.Count);
            for (int i = 0; i < count; i++)
            {
                MonitoringPlayerStatRecord row = rows[i];
                int totalKills = row.InfantryKills
                    + row.SoftVehicleKills
                    + row.ArmorKills
                    + row.AirKills;
                leaders.Add(
                    new MonitoringKillLeaderEntry
                    {
                        PlayerName = row.PlayerName ?? string.Empty,
                        TotalKills = totalKills,
                    });
            }

            return leaders;
        }

        public static double[] ToPlotXs(IReadOnlyList<MonitoringTimelinePoint> points)
        {
            var xs = new double[points.Count];
            for (int i = 0; i < points.Count; i++)
            {
                xs[i] = points[i].TimestampUnix;
            }

            return xs;
        }

        public static double[] ToOnlineYs(IReadOnlyList<MonitoringTimelinePoint> points)
        {
            var ys = new double[points.Count];
            for (int i = 0; i < points.Count; i++)
            {
                ys[i] = points[i].AllPlayers;
            }

            return ys;
        }

        public static double[] ToFpsYs(IReadOnlyList<MonitoringTimelinePoint> points)
        {
            var ys = new double[points.Count];
            for (int i = 0; i < points.Count; i++)
            {
                ys[i] = points[i].Fps;
            }

            return ys;
        }
    }

    public static class MonitoringCsvExporter
    {
        public static string BuildPlayerStatsCsv(IReadOnlyList<MonitoringPlayerStatRecord> rows)
        {
            var builder = new StringBuilder();
            builder.AppendLine("玩家ID,昵称,步兵击杀,软目标,装甲,空中,死亡,得分,在线,时间");
            if (rows == null)
            {
                return builder.ToString();
            }

            for (int i = 0; i < rows.Count; i++)
            {
                MonitoringPlayerStatRecord row = rows[i];
                builder.Append(Escape(row.PlayerId));
                builder.Append(',');
                builder.Append(Escape(row.PlayerName));
                builder.Append(',');
                builder.Append(row.InfantryKills.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.Append(row.SoftVehicleKills.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.Append(row.ArmorKills.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.Append(row.AirKills.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.Append(row.Deaths.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.Append(row.TotalScore.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.Append(row.Online.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.AppendLine(Escape(row.CreateTime));
            }

            return builder.ToString();
        }

        public static string BuildObjectStatsCsv(IReadOnlyList<MonitoringObjectStatRecord> rows)
        {
            var builder = new StringBuilder();
            builder.AppendLine("快照ID,玩家数,单位数,帧率,最低帧率,时间,时间戳");
            if (rows == null)
            {
                return builder.ToString();
            }

            for (int i = 0; i < rows.Count; i++)
            {
                MonitoringObjectStatRecord row = rows[i];
                builder.Append(row.Id.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.Append(row.AllPlayers.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.Append(row.AllUnits.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.Append(row.Fps.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.Append(row.FpsMin.ToString(CultureInfo.InvariantCulture));
                builder.Append(',');
                builder.Append(Escape(row.CreateTime));
                builder.Append(',');
                builder.AppendLine(row.CreateTimeTimestamp.ToString(CultureInfo.InvariantCulture));
            }

            return builder.ToString();
        }

        public static string BuildPlayerDirectoryCsv(IReadOnlyList<PlayerDB> rows)
        {
            var builder = new StringBuilder();
            builder.AppendLine("Steam GUID,昵称,IP,最后上线");
            if (rows == null)
            {
                return builder.ToString();
            }

            for (int i = 0; i < rows.Count; i++)
            {
                PlayerDB row = rows[i];
                builder.Append(Escape(row.Guid));
                builder.Append(',');
                builder.Append(Escape(row.Name));
                builder.Append(',');
                builder.Append(Escape(row.Ip));
                builder.Append(',');
                builder.AppendLine(Escape(row.Time));
            }

            return builder.ToString();
        }

        public static byte[] ToUtf8BytesWithBom(string content)
        {
            if (content == null)
            {
                content = string.Empty;
            }

            byte[] payload = Encoding.UTF8.GetBytes(content);
            byte[] bom = Encoding.UTF8.GetPreamble();
            var bytes = new byte[bom.Length + payload.Length];
            Buffer.BlockCopy(bom, 0, bytes, 0, bom.Length);
            Buffer.BlockCopy(payload, 0, bytes, bom.Length, payload.Length);
            return bytes;
        }

        private static string Escape(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            bool needsQuotes = value.IndexOf(',') >= 0
                || value.IndexOf('"') >= 0
                || value.IndexOf('\n') >= 0
                || value.IndexOf('\r') >= 0;
            if (!needsQuotes)
            {
                return value;
            }

            return "\"" + value.Replace("\"", "\"\"") + "\"";
        }
    }

    public static class MonitoringHtmlReportBuilder
    {
        public static string BuildDailyReport(
            string configName,
            string serverUuid,
            DateTime reportDate,
            IReadOnlyList<MonitoringObjectStatRecord> snapshots,
            IReadOnlyList<MonitoringPlayerStatRecord> playerStats)
        {
            string datePrefix = reportDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var dailySnapshots = new List<MonitoringObjectStatRecord>();
            if (snapshots != null)
            {
                for (int i = 0; i < snapshots.Count; i++)
                {
                    MonitoringObjectStatRecord row = snapshots[i];
                    if (row.CreateTime != null && row.CreateTime.StartsWith(datePrefix, StringComparison.Ordinal))
                    {
                        dailySnapshots.Add(row);
                    }
                }
            }

            int snapshotCount = dailySnapshots.Count;
            int peakPlayers = 0;
            double fpsSum = 0;
            int fpsMin = int.MaxValue;
            for (int i = 0; i < dailySnapshots.Count; i++)
            {
                MonitoringObjectStatRecord row = dailySnapshots[i];
                if (row.AllPlayers > peakPlayers)
                {
                    peakPlayers = row.AllPlayers;
                }

                fpsSum += row.Fps;
                if (row.FpsMin < fpsMin)
                {
                    fpsMin = row.FpsMin;
                }
            }

            double avgFps = 0;
            if (snapshotCount > 0)
            {
                avgFps = fpsSum / snapshotCount;
            }

            if (fpsMin == int.MaxValue)
            {
                fpsMin = 0;
            }

            IReadOnlyList<MonitoringKillLeaderEntry> leaders =
                MonitoringChartDataBuilder.BuildTopKillLeaders(playerStats, 10);

            var builder = new StringBuilder();
            builder.AppendLine("<!DOCTYPE html>");
            builder.AppendLine("<html lang=\"zh-CN\">");
            builder.AppendLine("<head>");
            builder.AppendLine("<meta charset=\"utf-8\" />");
            builder.AppendLine("<title>监控日报 - " + EscapeHtml(configName) + "</title>");
            builder.AppendLine("<style>body{font-family:Segoe UI,sans-serif;margin:24px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background:#f5f5f5;}</style>");
            builder.AppendLine("</head>");
            builder.AppendLine("<body>");
            builder.AppendLine("<h1>Arma 3 服务器监控日报</h1>");
            builder.AppendLine("<p><strong>配置名：</strong>" + EscapeHtml(configName) + "</p>");
            builder.AppendLine("<p><strong>UUID：</strong>" + EscapeHtml(serverUuid) + "</p>");
            builder.AppendLine("<p><strong>日期：</strong>" + EscapeHtml(datePrefix) + "</p>");
            builder.AppendLine("<h2>摘要</h2>");
            builder.AppendLine("<ul>");
            builder.AppendLine("<li>快照条数：" + snapshotCount.ToString(CultureInfo.InvariantCulture) + "</li>");
            builder.AppendLine("<li>峰值在线：" + peakPlayers.ToString(CultureInfo.InvariantCulture) + "</li>");
            builder.AppendLine("<li>平均 FPS：" + avgFps.ToString("0.0", CultureInfo.InvariantCulture) + "</li>");
            builder.AppendLine("<li>最低 FPS：" + fpsMin.ToString(CultureInfo.InvariantCulture) + "</li>");
            builder.AppendLine("</ul>");
            builder.AppendLine("<h2>击杀榜 Top 10</h2>");
            builder.AppendLine("<table><thead><tr><th>昵称</th><th>总击杀</th></tr></thead><tbody>");
            for (int i = 0; i < leaders.Count; i++)
            {
                MonitoringKillLeaderEntry leader = leaders[i];
                builder.Append("<tr><td>");
                builder.Append(EscapeHtml(leader.PlayerName));
                builder.Append("</td><td>");
                builder.Append(leader.TotalKills.ToString(CultureInfo.InvariantCulture));
                builder.AppendLine("</td></tr>");
            }

            builder.AppendLine("</tbody></table>");
            builder.AppendLine("<p>由 Arma3 开服工具生成。</p>");
            builder.AppendLine("</body></html>");
            return builder.ToString();
        }

        private static string EscapeHtml(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            return value
                .Replace("&", "&amp;")
                .Replace("<", "&lt;")
                .Replace(">", "&gt;")
                .Replace("\"", "&quot;");
        }
    }
}
