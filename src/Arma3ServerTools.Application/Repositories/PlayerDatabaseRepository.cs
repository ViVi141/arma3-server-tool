using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Text;
using Arma3ServerTools.Application.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;
using Microsoft.Data.Sqlite;

namespace Arma3ServerTools.Application.Repositories
{
    public sealed class PlayerDatabaseRepository : IDisposable
    {
        private readonly IAppPaths paths;
        private SqliteConnection connection;

        public PlayerDatabaseRepository(IAppPaths paths)
        {
            this.paths = paths;
        }

        public void EnsureInitialized()
        {
            if (connection != null && connection.State == ConnectionState.Open)
            {
                return;
            }

            string dbPath = Path.Combine(paths.ApplicationBase, "destiny_players.db");
            connection = new SqliteConnection(BuildConnectionString(dbPath));
            connection.Open();
            EnsureSchema();
        }

        public int CountByGuid(string guid)
        {
            EnsureInitialized();
            using (SqliteCommand command = new SqliteCommand(
                "SELECT COUNT(*) FROM destiny_players WHERE guid = @guid",
                connection))
            {
                command.Parameters.AddWithValue("@guid", guid);
                return Convert.ToInt32(command.ExecuteScalar());
            }
        }

        public int Insert(string guid, string playerName, string ip, string createDate)
        {
            EnsureInitialized();
            using (SqliteCommand command = new SqliteCommand(
                "INSERT INTO destiny_players (guid, player_name, ip, create_date) VALUES (@guid, @name, @ip, @date)",
                connection))
            {
                command.Parameters.AddWithValue("@guid", guid);
                command.Parameters.AddWithValue("@name", playerName);
                command.Parameters.AddWithValue("@ip", ip);
                command.Parameters.AddWithValue("@date", createDate);
                return command.ExecuteNonQuery();
            }
        }

        public int Update(string guid, string playerName, string ip, string createDate)
        {
            EnsureInitialized();
            using (SqliteCommand command = new SqliteCommand(
                "UPDATE destiny_players SET player_name = @name, ip = @ip, create_date = @date WHERE guid = @guid",
                connection))
            {
                command.Parameters.AddWithValue("@guid", guid);
                command.Parameters.AddWithValue("@name", playerName);
                command.Parameters.AddWithValue("@ip", ip);
                command.Parameters.AddWithValue("@date", createDate);
                return command.ExecuteNonQuery();
            }
        }

        public List<PlayerDB> LoadAll()
        {
            EnsureInitialized();
            var result = new List<PlayerDB>();
            using (SqliteCommand command = new SqliteCommand("SELECT id, guid, player_name, ip, create_date FROM destiny_players", connection))
            using (SqliteDataReader reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    result.Add(new PlayerDB(
                        reader.GetInt32(0),
                        reader.GetString(3),
                        reader.GetString(1),
                        reader.GetString(2),
                        reader.GetString(4)));
                }
            }

            return result;
        }

        public void Dispose()
        {
            if (connection != null)
            {
                connection.Dispose();
                connection = null;
            }
        }

        private static string BuildConnectionString(string dbPath)
        {
            var builder = new SqliteConnectionStringBuilder
            {
                DataSource = dbPath,
                Pooling = false,
            };
            return builder.ConnectionString;
        }

        private void EnsureSchema()
        {
            string schemaPath = Path.Combine(paths.ApplicationBase, @"sql\destiny_players.sql");
            if (!File.Exists(schemaPath))
            {
                throw new ConfigException("找不到玩家库建表脚本: " + schemaPath);
            }

            string sql = File.ReadAllText(schemaPath, new UTF8Encoding(false));
            SqliteScriptExecutor.ExecuteScript(connection, sql);
        }
    }
}
