using System;
using System.IO;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Microsoft.Data.Sqlite;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class MonitoringIngestServiceTests
    {
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
                    DataSource = Path.Combine(root, "destiny_statistics.db"),
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
            string sqlSource = FindSchemaPath();
            Assert.True(File.Exists(sqlSource), "测试需要 sql/destiny_statistics.sql");
            Directory.CreateDirectory(Path.Combine(root, "sql"));
            File.Copy(sqlSource, Path.Combine(root, "sql", "destiny_statistics.sql"), true);
        }

        private static string FindSchemaPath()
        {
            string[] candidates = new[]
            {
                Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "sql", "destiny_statistics.sql")),
                Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "sql", "destiny_statistics.sql")),
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                if (File.Exists(candidates[i]))
                {
                    return candidates[i];
                }
            }

            return candidates[0];
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
