using System.IO;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Repositories;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class MonitoringQueryServiceTests
    {
        private const string ServerUuid = "server-uuid-test";

        [Fact]
        public void InitPlayerOnlineInfo_DoesNotThrowOnEmptyDatabase()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mon-query");
            try
            {
                AutomatedTestWorkspace.CopySqlSchema(root);
                using (var database = new MonitoringDatabase(new AppPaths(root)))
                {
                    var service = new MonitoringQueryService(database);
                    int rows = service.InitPlayerOnlineInfo(ServerUuid);
                    Assert.True(rows >= 0);
                }
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void GetPlayerStats_AfterIngest_ReturnsPersistedRow()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mon-query-player");
            try
            {
                AutomatedTestWorkspace.CopySqlSchema(root);
                using (var database = new MonitoringDatabase(new AppPaths(root)))
                {
                    var ingest = new MonitoringIngestService(database);
                    ingest.Ingest("PlayerInfo:" + ServerUuid + ":42:Alpha:1:2:3:4:5:100");

                    var service = new MonitoringQueryService(database);
                    var stats = service.GetPlayerStats(ServerUuid, 10);
                    Assert.Single(stats);
                    Assert.Equal("42", stats[0].PlayerId);
                    Assert.Equal("Alpha", stats[0].PlayerName);
                    Assert.Equal(100, stats[0].TotalScore);
                }
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void GetRecentObjectStats_AfterIngest_ReturnsPersistedRow()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mon-query-object");
            try
            {
                AutomatedTestWorkspace.CopySqlSchema(root);
                using (var database = new MonitoringDatabase(new AppPaths(root)))
                {
                    var ingest = new MonitoringIngestService(database);
                    ingest.Ingest(
                        "ObjectManipulationNum:" + ServerUuid + ":5:10:1:2:3:4:5:6:7:8:9:10:11:12:13:60.5:30.2");

                    var service = new MonitoringQueryService(database);
                    var stats = service.GetRecentObjectStats(ServerUuid, 5);
                    Assert.Single(stats);
                    Assert.Equal(5, stats[0].AllPlayers);
                    Assert.Equal(10, stats[0].AllUnits);
                    Assert.Equal(60, stats[0].Fps);
                    Assert.Equal(30, stats[0].FpsMin);
                }
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void DeleteObjectStatsOlderThanOneMonth_OnEmptyDatabase_ReturnsZero()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mon-query-delete");
            try
            {
                AutomatedTestWorkspace.CopySqlSchema(root);
                using (var database = new MonitoringDatabase(new AppPaths(root)))
                {
                    var service = new MonitoringQueryService(database);
                    int deleted = service.DeleteObjectStatsOlderThanOneMonth();
                    Assert.Equal(0, deleted);
                }
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }

    public class PlayerDirectoryServiceTests
    {
        [Fact]
        public void InsertLoadAll_RoundTrip()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3players-db");
            try
            {
                CopyPlayersSchema(root);
                using (var repository = new PlayerDatabaseRepository(new AppPaths(root)))
                {
                    repository.Insert("76561198000000001", "Tester", "127.0.0.1", "2026-01-01");
                    var players = repository.LoadAll();
                    Assert.Single(players);
                    Assert.Equal("Tester", players[0].Name);
                }
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void SyncPlayers_InsertsAndUpdates()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3player-dir");
            try
            {
                CopyPlayersSchema(root);
                using (var repository = new PlayerDatabaseRepository(new AppPaths(root)))
                {
                    var service = new PlayerDirectoryService(repository);
                    var players = new System.Collections.Generic.List<BytexDigital.BattlEye.Rcon.Domain.Player>
                    {
                        new BytexDigital.BattlEye.Rcon.Domain.Player(
                            1,
                            new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, 2302),
                            50,
                            "76561198000000001",
                            "Alpha",
                            true,
                            false),
                    };

                    service.SyncPlayers(players);
                    service.SyncPlayers(players);
                    Assert.Single(service.LoadAll());
                }
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        private static void CopyPlayersSchema(string root)
        {
            AutomatedTestWorkspace.CopyPlayersSchema(root);
        }
    }
}
