using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using Arma3ServerTools.Application.IO;
using Arma3ServerTools.Core;
using Microsoft.Data.Sqlite;

namespace Arma3ServerTools.Application.Monitoring
{
    public sealed class MonitoringDatabase : IDisposable
    {
        private readonly IAppPaths paths;
        private SqliteConnection connection;

        public MonitoringDatabase(IAppPaths paths)
        {
            this.paths = paths;
        }

        public void EnsureInitialized()
        {
            if (connection != null && connection.State == ConnectionState.Open)
            {
                return;
            }

            string dbPath = Path.Combine(paths.ApplicationBase, "destiny_statistics.db");
            connection = new SqliteConnection(BuildConnectionString(dbPath));
            connection.Open();
            EnsureSchema();
        }

        public int GetOrCreateServerId(string serverName)
        {
            EnsureInitialized();
            using (SqliteCommand select = new SqliteCommand(
                "SELECT id FROM a3_servers WHERE server_name = @name",
                connection))
            {
                select.Parameters.AddWithValue("@name", serverName);
                object scalar = select.ExecuteScalar();
                if (scalar != null && scalar != DBNull.Value)
                {
                    return Convert.ToInt32(scalar);
                }
            }

            using (SqliteCommand insert = new SqliteCommand(
                "INSERT INTO a3_servers(server_name) VALUES (@name); SELECT last_insert_rowid();",
                connection))
            {
                insert.Parameters.AddWithValue("@name", serverName);
                return Convert.ToInt32(insert.ExecuteScalar());
            }
        }

        public int InsertOrUpdatePlayerInfo(int serverId, string[] args)
        {
            EnsureInitialized();
            using (SqliteCommand exists = new SqliteCommand(
                "SELECT id FROM a3_player_info WHERE player_id = @playerId",
                connection))
            {
                exists.Parameters.AddWithValue("@playerId", args[2]);
                object scalar = exists.ExecuteScalar();
                if (scalar == null || scalar == DBNull.Value)
                {
                    using (SqliteCommand insert = new SqliteCommand(
                        "INSERT INTO a3_player_info(server_id, data_key, player_id, player_name, infantry_kills, soft_vehicle_kills, armor_kills, air_kills, deaths, total_score, create_time, online, create_time_timestamp) "
                        + "VALUES (@serverId, @dataKey, @playerId, @playerName, @infantry, @soft, @armor, @air, @deaths, @score, @createTime, 1, @timestamp)",
                        connection))
                    {
                        AddPlayerParameters(insert, serverId, args);
                        return insert.ExecuteNonQuery();
                    }
                }
            }

            using (SqliteCommand update = new SqliteCommand(
                "UPDATE a3_player_info SET player_name = @playerName, infantry_kills = infantry_kills + @infantry, "
                + "soft_vehicle_kills = soft_vehicle_kills + @soft, armor_kills = armor_kills + @armor, "
                + "air_kills = air_kills + @air, deaths = deaths + @deaths, total_score = total_score + @score "
                + "WHERE player_id = @playerId",
                connection))
            {
                update.Parameters.AddWithValue("@playerName", args[3]);
                update.Parameters.AddWithValue("@infantry", args[4]);
                update.Parameters.AddWithValue("@soft", args[5]);
                update.Parameters.AddWithValue("@armor", args[6]);
                update.Parameters.AddWithValue("@air", args[7]);
                update.Parameters.AddWithValue("@deaths", args[8]);
                update.Parameters.AddWithValue("@score", args[9]);
                update.Parameters.AddWithValue("@playerId", args[2]);
                return update.ExecuteNonQuery();
            }
        }

        public int InsertObjectNum(int serverId, string[] args)
        {
            EnsureInitialized();
            using (SqliteCommand insert = new SqliteCommand(
                "INSERT INTO a3_object_manipulation_num(server_id, data_key, all_player, all_units, all_car, all_helicopter, "
                + "all_motorcycle, all_plane, all_ship, all_static_weapon, all_apc, all_tank, all_units_uav, all_mission_objects, "
                + "all_dead_men, all_groups, all_mines, fps, fps_min, create_time, create_time_timestamp) "
                + "VALUES (@serverId, @dataKey, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, @p15, @p16, @fps, @fpsMin, @createTime, @timestamp)",
                connection))
            {
                insert.Parameters.AddWithValue("@serverId", serverId);
                insert.Parameters.AddWithValue("@dataKey", args[0]);
                for (int i = 2; i <= 16; i++)
                {
                    insert.Parameters.AddWithValue("@p" + i, args[i]);
                }

                insert.Parameters.AddWithValue("@fps", (int)Convert.ToDouble(args[17]));
                insert.Parameters.AddWithValue("@fpsMin", (int)Convert.ToDouble(args[18]));
                insert.Parameters.AddWithValue("@createTime", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
                insert.Parameters.AddWithValue("@timestamp", GetUnixTimestamp());
                return insert.ExecuteNonQuery();
            }
        }

        public int UpdatePlayerOnlineInfo(int serverId, string[] args)
        {
            EnsureInitialized();
            using (SqliteCommand update = new SqliteCommand(
                "UPDATE a3_player_info SET online = @online WHERE player_id = @playerId AND server_id = @serverId",
                connection))
            {
                update.Parameters.AddWithValue("@online", args[3]);
                update.Parameters.AddWithValue("@playerId", args[2]);
                update.Parameters.AddWithValue("@serverId", serverId);
                return update.ExecuteNonQuery();
            }
        }

        public int InitPlayerOnlineInfo(string serverUuid)
        {
            EnsureInitialized();
            using (SqliteCommand update = new SqliteCommand(
                "UPDATE a3_player_info SET online = '0' "
                + "WHERE server_id = (SELECT id FROM a3_servers WHERE server_name = @serverName)",
                connection))
            {
                update.Parameters.AddWithValue("@serverName", serverUuid);
                return update.ExecuteNonQuery();
            }
        }

        public int DeleteObjectStatsBeforeTimestamp(string unixTimestamp)
        {
            EnsureInitialized();
            using (SqliteCommand delete = new SqliteCommand(
                "DELETE FROM a3_object_manipulation_num WHERE create_time_timestamp < @timestamp",
                connection))
            {
                delete.Parameters.AddWithValue("@timestamp", unixTimestamp);
                return delete.ExecuteNonQuery();
            }
        }

        public List<MonitoringPlayerStatRecord> QueryPlayerStats(string serverUuid, int limit)
        {
            EnsureInitialized();
            var result = new List<MonitoringPlayerStatRecord>();
            using (SqliteCommand command = new SqliteCommand(
                "SELECT p.id, p.player_id, p.player_name, p.infantry_kills, p.soft_vehicle_kills, "
                + "p.armor_kills, p.air_kills, p.deaths, p.total_score, p.create_time, p.online "
                + "FROM a3_player_info p INNER JOIN a3_servers s ON p.server_id = s.id "
                + "WHERE s.server_name = @serverName ORDER BY p.total_score DESC LIMIT @limit",
                connection))
            {
                command.Parameters.AddWithValue("@serverName", serverUuid);
                command.Parameters.AddWithValue("@limit", limit);
                using (SqliteDataReader reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        result.Add(new MonitoringPlayerStatRecord
                        {
                            Id = reader.GetInt32(0),
                            PlayerId = reader.GetString(1),
                            PlayerName = reader.GetString(2),
                            InfantryKills = reader.GetInt32(3),
                            SoftVehicleKills = reader.GetInt32(4),
                            ArmorKills = reader.GetInt32(5),
                            AirKills = reader.GetInt32(6),
                            Deaths = reader.GetInt32(7),
                            TotalScore = reader.GetInt32(8),
                            CreateTime = reader.GetString(9),
                            Online = reader.GetInt32(10),
                        });
                    }
                }
            }

            return result;
        }

        public List<MonitoringObjectStatRecord> QueryRecentObjectStats(string serverUuid, int limit)
        {
            EnsureInitialized();
            var result = new List<MonitoringObjectStatRecord>();
            using (SqliteCommand command = new SqliteCommand(
                "SELECT o.id, o.all_player, o.all_units, o.fps, o.fps_min, o.create_time "
                + "FROM a3_object_manipulation_num o INNER JOIN a3_servers s ON o.server_id = s.id "
                + "WHERE s.server_name = @serverName ORDER BY o.id DESC LIMIT @limit",
                connection))
            {
                command.Parameters.AddWithValue("@serverName", serverUuid);
                command.Parameters.AddWithValue("@limit", limit);
                using (SqliteDataReader reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        result.Add(new MonitoringObjectStatRecord
                        {
                            Id = reader.GetInt32(0),
                            AllPlayers = reader.GetInt32(1),
                            AllUnits = reader.GetInt32(2),
                            Fps = reader.GetInt32(3),
                            FpsMin = reader.GetInt32(4),
                            CreateTime = reader.GetString(5),
                        });
                    }
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
            string schemaPath = Path.Combine(paths.ApplicationBase, @"sql\destiny_statistics.sql");
            if (!File.Exists(schemaPath))
            {
                throw new ConfigException("找不到统计库建表脚本: " + schemaPath);
            }

            string sql = File.ReadAllText(schemaPath, System.Text.Encoding.UTF8);
            SqliteScriptExecutor.ExecuteScript(connection, sql);
        }

        private static void AddPlayerParameters(SqliteCommand command, int serverId, string[] args)
        {
            command.Parameters.AddWithValue("@serverId", serverId);
            command.Parameters.AddWithValue("@dataKey", args[0]);
            command.Parameters.AddWithValue("@playerId", args[2]);
            command.Parameters.AddWithValue("@playerName", args[3]);
            command.Parameters.AddWithValue("@infantry", args[4]);
            command.Parameters.AddWithValue("@soft", args[5]);
            command.Parameters.AddWithValue("@armor", args[6]);
            command.Parameters.AddWithValue("@air", args[7]);
            command.Parameters.AddWithValue("@deaths", args[8]);
            command.Parameters.AddWithValue("@score", args[9]);
            command.Parameters.AddWithValue("@createTime", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            command.Parameters.AddWithValue("@timestamp", GetUnixTimestamp());
        }

        private static string GetUnixTimestamp()
        {
            long seconds = (DateTime.UtcNow.Ticks - 621355968000000000L) / 10000000L;
            return seconds.ToString();
        }
    }
}
