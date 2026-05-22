using System;
using System.Collections.Generic;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class MonitoringExportServiceTests
    {
        [Fact]
        public void BuildPlayerStatsCsv_EscapesCommaInName()
        {
            var rows = new List<MonitoringPlayerStatRecord>
            {
                new MonitoringPlayerStatRecord
                {
                    PlayerId = "1",
                    PlayerName = "Alpha, Beta",
                    InfantryKills = 1,
                    TotalScore = 10,
                    CreateTime = "2026-05-22 12:00:00",
                },
            };

            string csv = MonitoringCsvExporter.BuildPlayerStatsCsv(rows);

            Assert.Contains("\"Alpha, Beta\"", csv);
        }

        [Fact]
        public void BuildDailyReport_IncludesSummaryForMatchingDate()
        {
            var snapshots = new List<MonitoringObjectStatRecord>
            {
                new MonitoringObjectStatRecord
                {
                    AllPlayers = 12,
                    Fps = 40,
                    FpsMin = 30,
                    CreateTime = "2026-05-22 10:00:00",
                },
                new MonitoringObjectStatRecord
                {
                    AllPlayers = 8,
                    Fps = 35,
                    FpsMin = 25,
                    CreateTime = "2026-05-21 10:00:00",
                },
            };
            var players = new List<MonitoringPlayerStatRecord>
            {
                new MonitoringPlayerStatRecord
                {
                    PlayerName = "Tester",
                    InfantryKills = 3,
                    SoftVehicleKills = 1,
                },
            };

            string html = MonitoringHtmlReportBuilder.BuildDailyReport(
                "Test Server",
                "uuid-1",
                new DateTime(2026, 5, 22),
                snapshots,
                players);

            Assert.Contains("峰值在线：12", html);
            Assert.Contains("Tester", html);
            Assert.DoesNotContain("2026-05-21", html);
        }

        [Fact]
        public void BuildTopKillLeaders_SumsAllKillTypes()
        {
            var rows = new List<MonitoringPlayerStatRecord>
            {
                new MonitoringPlayerStatRecord
                {
                    PlayerName = "Ace",
                    InfantryKills = 2,
                    SoftVehicleKills = 1,
                    ArmorKills = 1,
                    AirKills = 1,
                },
            };

            IReadOnlyList<MonitoringKillLeaderEntry> leaders =
                MonitoringChartDataBuilder.BuildTopKillLeaders(rows, 5);

            Assert.Single(leaders);
            Assert.Equal(5, leaders[0].TotalKills);
        }

        [Fact]
        public void ToUtf8BytesWithBom_StartsWithBom()
        {
            byte[] bytes = MonitoringCsvExporter.ToUtf8BytesWithBom("a,b");

            Assert.Equal(0xEF, bytes[0]);
            Assert.Equal(0xBB, bytes[1]);
            Assert.Equal(0xBF, bytes[2]);
        }
    }
}
