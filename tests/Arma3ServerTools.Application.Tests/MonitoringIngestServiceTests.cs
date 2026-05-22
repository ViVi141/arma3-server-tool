using System;
using System.IO;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.TestSupport;
using Microsoft.Data.Sqlite;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class MonitoringIngestServiceTests
    {
        [Fact]
        public void Ingest_PipeSeparatedMessages_ProcessesEachSegment()
        {
            string root = CreateTempRoot();
            MonitoringDatabase database = null;
            try
            {
                CopySchema(root);
                database = new MonitoringDatabase(new AppPaths(root));
                var ingest = new MonitoringIngestService(database);
                ingest.Ingest(
                    "PlayerInfo:server-pipe:42:Tester:1:2:3:4:5:100|UpdateOnlineInfo:server-pipe:42:0");

                database.EnsureInitialized();
                var connectionBuilder = new SqliteConnectionStringBuilder
                {
                    DataSource = Path.Combine(root, ToolConstants.StatisticsDatabaseFileName),
                    Pooling = false,
                };
                using (SqliteConnection connection = new SqliteConnection(connectionBuilder.ConnectionString))
                {
                    connection.Open();
                    using (SqliteCommand command = new SqliteCommand(
                        "SELECT online FROM a3_player_info WHERE player_id = '42'",
                        connection))
                    {
                        long online = (long)command.ExecuteScalar();
                        Assert.Equal(0L, online);
                    }
                }
            }
            finally
            {
                if (database != null)
                {
                    database.Dispose();
                }

                DeleteDirectory(root);
            }
        }

        [Fact]
        public void Ingest_ObjectManipulationNum_PersistsRow()
        {
            string root = CreateTempRoot();
            MonitoringDatabase database = null;
            try
            {
                CopySchema(root);
                database = new MonitoringDatabase(new AppPaths(root));
                var ingest = new MonitoringIngestService(database);
                ingest.Ingest(
                    "ObjectManipulationNum:server-obj:1:2:3:4:5:6:7:8:9:10:11:12:13:14:15:60.5:30.2");

                database.EnsureInitialized();
                var connectionBuilder = new SqliteConnectionStringBuilder
                {
                    DataSource = Path.Combine(root, ToolConstants.StatisticsDatabaseFileName),
                    Pooling = false,
                };
                using (SqliteConnection connection = new SqliteConnection(connectionBuilder.ConnectionString))
                {
                    connection.Open();
                    using (SqliteCommand command = new SqliteCommand(
                        "SELECT COUNT(*) FROM a3_object_manipulation_num WHERE data_key = 'ObjectManipulationNum'",
                        connection))
                    {
                        long count = (long)command.ExecuteScalar();
                        Assert.Equal(1, count);
                    }
                }
            }
            finally
            {
                if (database != null)
                {
                    database.Dispose();
                }

                DeleteDirectory(root);
            }
        }

        [Fact]
        public void Ingest_UpdateOnlineInfo_UpdatesExistingPlayer()
        {
            string root = CreateTempRoot();
            MonitoringDatabase database = null;
            try
            {
                CopySchema(root);
                database = new MonitoringDatabase(new AppPaths(root));
                var ingest = new MonitoringIngestService(database);
                ingest.Ingest("PlayerInfo:server-online:99:OnlineUser:0:0:0:0:0:0");
                ingest.Ingest("UpdateOnlineInfo:server-online:99:0");

                database.EnsureInitialized();
                var connectionBuilder = new SqliteConnectionStringBuilder
                {
                    DataSource = Path.Combine(root, ToolConstants.StatisticsDatabaseFileName),
                    Pooling = false,
                };
                using (SqliteConnection connection = new SqliteConnection(connectionBuilder.ConnectionString))
                {
                    connection.Open();
                    using (SqliteCommand command = new SqliteCommand(
                        "SELECT online FROM a3_player_info WHERE player_id = '99'",
                        connection))
                    {
                        long online = (long)command.ExecuteScalar();
                        Assert.Equal(0L, online);
                    }
                }
            }
            finally
            {
                if (database != null)
                {
                    database.Dispose();
                }

                DeleteDirectory(root);
            }
        }

        [Fact]
        public void Ingest_PlayerInfo_PersistsRow()
        {
            string root = CreateTempRoot();
            MonitoringDatabase database = null;
            try
            {
                CopySchema(root);
                database = new MonitoringDatabase(new AppPaths(root));
                var ingest = new MonitoringIngestService(database);
                ingest.Ingest("PlayerInfo:server-a:42:Tester:1:2:3:4:5:100");

                database.EnsureInitialized();
                var connectionBuilder = new SqliteConnectionStringBuilder
                {
                    DataSource = Path.Combine(root, ToolConstants.StatisticsDatabaseFileName),
                    Pooling = false,
                };
                using (SqliteConnection connection = new SqliteConnection(connectionBuilder.ConnectionString))
                {
                    connection.Open();
                    using (SqliteCommand command = new SqliteCommand(
                        "SELECT COUNT(*) FROM a3_player_info WHERE player_id = '42'",
                        connection))
                    {
                        long count = (long)command.ExecuteScalar();
                        Assert.Equal(1, count);
                    }
                }
            }
            finally
            {
                if (database != null)
                {
                    database.Dispose();
                }

                DeleteDirectory(root);
            }
        }

        private static void CopySchema(string root)
        {
            AutomatedTestWorkspace.CopySqlSchema(root);
        }

        private static string CreateTempRoot()
        {
            string path = Path.Combine(Path.GetTempPath(), "a3mon-test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(path);
            return path;
        }

        private static void DeleteDirectory(string path)
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
        }
    }
}
