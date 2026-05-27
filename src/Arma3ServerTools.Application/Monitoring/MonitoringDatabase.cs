using System;
using System.Collections.Generic;
using System.Data;
using System.Globalization;
using System.IO;
using Arma3ServerTools.Application.IO;
using Arma3ServerTools.Core;
using Microsoft.Data.Sqlite;

namespace Arma3ServerTools.Application.Monitoring
{
    public sealed class MonitoringDatabase : IDisposable
    {
        private readonly IAppPaths paths;
        private readonly object syncRoot = new object();
        private readonly Dictionary<string, int> serverIdCache = new Dictionary<string, int>(StringComparer.Ordinal);
        private SqliteConnection connection;

        public MonitoringDatabase(IAppPaths paths)
        {
            this.paths = paths;
        }

        public void EnsureInitialized()
        {
            lock (syncRoot)
            {
                EnsureInitializedCore();
            }
        }

        private void EnsureInitializedCore()
        {
            if (connection != null && connection.State == ConnectionState.Open)
            {
                return;
            }

            string dbPath = Path.Combine(paths.UserDataDirectory, ToolConstants.StatisticsDatabaseFileName);
            connection = new SqliteConnection(BuildConnectionString(dbPath));
            connection.Open();
            EnsurePerformancePragmas();
            EnsureSchema();
        }

        public int GetOrCreateServerId(string serverName)
        {
            lock (syncRoot)
            {
                EnsureInitializedCore();
                int cachedServerId;
                if (serverIdCache.TryGetValue(serverName, out cachedServerId))
                {
                    return cachedServerId;
                }

                using (SqliteCommand select = new SqliteCommand(
                    "SELECT id FROM a3_servers WHERE server_name = @name",
                    connection))
                {
                    select.Parameters.AddWithValue("@name", serverName);
                    object scalar = select.ExecuteScalar();
                    if (scalar != null && scalar != DBNull.Value)
                    {
                        int serverId = Convert.ToInt32(scalar);
                        serverIdCache[serverName] = serverId;
                        return serverId;
                    }
                }

                using (SqliteCommand insert = new SqliteCommand("INSERT OR IGNORE INTO a3_servers(server_name) VALUES (@name)", connection))
                {
                    insert.Parameters.AddWithValue("@name", serverName);
                    insert.ExecuteNonQuery();
                }

                using (SqliteCommand selectAfterInsert = new SqliteCommand(
                    "SELECT id FROM a3_servers WHERE server_name = @name",
                    connection))
                {
                    selectAfterInsert.Parameters.AddWithValue("@name", serverName);
                    object scalar = selectAfterInsert.ExecuteScalar();
                    if (scalar == null || scalar == DBNull.Value)
                    {
                        return 0;
                    }

                    int serverId = Convert.ToInt32(scalar);
                    serverIdCache[serverName] = serverId;
                    return serverId;
                }
            }
        }

        public int InsertOrUpdatePlayerInfo(int serverId, string[] args)
        {
            lock (syncRoot)
            {
                EnsureInitializedCore();
                using (SqliteCommand upsert = new SqliteCommand(
                    "INSERT INTO a3_player_info(server_id, data_key, player_id, player_name, infantry_kills, soft_vehicle_kills, armor_kills, air_kills, deaths, total_score, create_time, online, create_time_timestamp) "
                    + "VALUES (@serverId, @dataKey, @playerId, @playerName, @infantry, @soft, @armor, @air, @deaths, @score, @createTime, 1, @timestamp) "
                    + "ON CONFLICT(server_id, player_id) DO UPDATE SET "
                    + "player_name = excluded.player_name, "
                    + "infantry_kills = infantry_kills + excluded.infantry_kills, "
                    + "soft_vehicle_kills = soft_vehicle_kills + excluded.soft_vehicle_kills, "
                    + "armor_kills = armor_kills + excluded.armor_kills, "
                    + "air_kills = air_kills + excluded.air_kills, "
                    + "deaths = deaths + excluded.deaths, "
                    + "total_score = total_score + excluded.total_score, "
                    + "online = 1",
                    connection))
                {
                    AddPlayerParameters(upsert, serverId, args);
                    return upsert.ExecuteNonQuery();
                }
            }
        }

        public int InsertObjectNum(int serverId, string[] args)
        {
            lock (syncRoot)
            {
                EnsureInitializedCore();
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
                        int parsedValue;
                        if (!int.TryParse(args[i], NumberStyles.Integer, CultureInfo.InvariantCulture, out parsedValue))
                        {
                            parsedValue = 0;
                        }

                        insert.Parameters.AddWithValue("@p" + i, parsedValue);
                    }

                    insert.Parameters.AddWithValue("@fps", ParseDoubleToInt(args[17]));
                    insert.Parameters.AddWithValue("@fpsMin", ParseDoubleToInt(args[18]));
                    insert.Parameters.AddWithValue("@createTime", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
                    insert.Parameters.AddWithValue("@timestamp", GetUnixTimestamp());
                    return insert.ExecuteNonQuery();
                }
            }
        }

        public int UpdatePlayerOnlineInfo(int serverId, string[] args)
        {
            lock (syncRoot)
            {
                EnsureInitializedCore();
                using (SqliteCommand update = new SqliteCommand(
                    "UPDATE a3_player_info SET online = @online WHERE player_id = @playerId AND server_id = @serverId",
                    connection))
                {
                    int onlineValue;
                    if (!int.TryParse(args[3], NumberStyles.Integer, CultureInfo.InvariantCulture, out onlineValue))
                    {
                        onlineValue = 0;
                    }

                    update.Parameters.AddWithValue("@online", onlineValue);
                    update.Parameters.AddWithValue("@playerId", args[2]);
                    update.Parameters.AddWithValue("@serverId", serverId);
                    return update.ExecuteNonQuery();
                }
            }
        }

        public int InitPlayerOnlineInfo(string serverUuid)
        {
            lock (syncRoot)
            {
                EnsureInitializedCore();
                using (SqliteCommand update = new SqliteCommand(
                    "UPDATE a3_player_info SET online = '0' "
                    + "WHERE server_id = (SELECT id FROM a3_servers WHERE server_name = @serverName)",
                    connection))
                {
                    update.Parameters.AddWithValue("@serverName", serverUuid);
                    return update.ExecuteNonQuery();
                }
            }
        }

        public int DeleteObjectStatsBeforeTimestamp(string unixTimestamp)
        {
            lock (syncRoot)
            {
                EnsureInitializedCore();
                using (SqliteCommand delete = new SqliteCommand(
                    "DELETE FROM a3_object_manipulation_num WHERE create_time_timestamp < @timestamp",
                    connection))
                {
                    delete.Parameters.AddWithValue("@timestamp", unixTimestamp);
                    return delete.ExecuteNonQuery();
                }
            }
        }

        public List<MonitoringPlayerStatRecord> QueryPlayerStats(string serverUuid, int limit)
        {
            lock (syncRoot)
            {
                EnsureInitializedCore();
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
        }

        public List<MonitoringObjectStatRecord> QueryRecentObjectStats(string serverUuid, int limit)
        {
            lock (syncRoot)
            {
                EnsureInitializedCore();
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
                            result.Add(ReadObjectStatRecord(reader, includeTimestamp: false));
                        }
                    }
                }

                return result;
            }
        }

        public List<MonitoringObjectStatRecord> QueryObjectStatsTimeline(string serverUuid, int limit)
        {
            lock (syncRoot)
            {
                EnsureInitializedCore();
                var result = new List<MonitoringObjectStatRecord>();
                using (SqliteCommand command = new SqliteCommand(
                    "SELECT o.id, o.all_player, o.all_units, o.fps, o.fps_min, o.create_time, o.create_time_timestamp "
                    + "FROM a3_object_manipulation_num o INNER JOIN a3_servers s ON o.server_id = s.id "
                    + "WHERE s.server_name = @serverName ORDER BY o.create_time_timestamp ASC LIMIT @limit",
                    connection))
                {
                    command.Parameters.AddWithValue("@serverName", serverUuid);
                    command.Parameters.AddWithValue("@limit", limit);
                    using (SqliteDataReader reader = command.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            result.Add(ReadObjectStatRecord(reader, includeTimestamp: true));
                        }
                    }
                }

                return result;
            }
        }

        private static MonitoringObjectStatRecord ReadObjectStatRecord(
            SqliteDataReader reader,
            bool includeTimestamp)
        {
            var record = new MonitoringObjectStatRecord
            {
                Id = reader.GetInt32(0),
                AllPlayers = reader.GetInt32(1),
                AllUnits = reader.GetInt32(2),
                Fps = reader.GetInt32(3),
                FpsMin = reader.GetInt32(4),
                CreateTime = reader.GetString(5),
            };
            if (includeTimestamp && !reader.IsDBNull(6))
            {
                record.CreateTimeTimestamp = reader.GetInt64(6);
            }

            return record;
        }

        public void Dispose()
        {
            lock (syncRoot)
            {
                if (connection != null)
                {
                    connection.Dispose();
                    connection = null;
                }

                serverIdCache.Clear();
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
            string schemaPath = Path.Combine(paths.ApplicationBase, @"sql\" + ToolConstants.StatisticsSchemaFileName);
            if (!File.Exists(schemaPath))
            {
                throw new ConfigException("找不到统计库建表脚本: " + schemaPath);
            }

            string sql = File.ReadAllText(schemaPath, System.Text.Encoding.UTF8);
            SqliteScriptExecutor.ExecuteScript(connection, sql);
        }

        private void EnsurePerformancePragmas()
        {
            using (SqliteCommand pragma = new SqliteCommand(
                "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=3000;",
                connection))
            {
                pragma.ExecuteNonQuery();
            }
        }

        private static void AddPlayerParameters(SqliteCommand command, int serverId, string[] args)
        {
            int infantryKills;
            if (!int.TryParse(args[4], NumberStyles.Integer, CultureInfo.InvariantCulture, out infantryKills))
            {
                infantryKills = 0;
            }

            int softVehicleKills;
            if (!int.TryParse(args[5], NumberStyles.Integer, CultureInfo.InvariantCulture, out softVehicleKills))
            {
                softVehicleKills = 0;
            }

            int armorKills;
            if (!int.TryParse(args[6], NumberStyles.Integer, CultureInfo.InvariantCulture, out armorKills))
            {
                armorKills = 0;
            }

            int airKills;
            if (!int.TryParse(args[7], NumberStyles.Integer, CultureInfo.InvariantCulture, out airKills))
            {
                airKills = 0;
            }

            int deaths;
            if (!int.TryParse(args[8], NumberStyles.Integer, CultureInfo.InvariantCulture, out deaths))
            {
                deaths = 0;
            }

            int totalScore;
            if (!int.TryParse(args[9], NumberStyles.Integer, CultureInfo.InvariantCulture, out totalScore))
            {
                totalScore = 0;
            }

            command.Parameters.AddWithValue("@serverId", serverId);
            command.Parameters.AddWithValue("@dataKey", args[0]);
            command.Parameters.AddWithValue("@playerId", args[2]);
            command.Parameters.AddWithValue("@playerName", args[3]);
            command.Parameters.AddWithValue("@infantry", infantryKills);
            command.Parameters.AddWithValue("@soft", softVehicleKills);
            command.Parameters.AddWithValue("@armor", armorKills);
            command.Parameters.AddWithValue("@air", airKills);
            command.Parameters.AddWithValue("@deaths", deaths);
            command.Parameters.AddWithValue("@score", totalScore);
            command.Parameters.AddWithValue("@createTime", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            command.Parameters.AddWithValue("@timestamp", GetUnixTimestamp());
        }

        private static int ParseDoubleToInt(string value)
        {
            double parsed;
            if (!double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out parsed))
            {
                return 0;
            }

            return (int)parsed;
        }

        private static string GetUnixTimestamp()
        {
            long seconds = (DateTime.UtcNow.Ticks - 621355968000000000L) / 10000000L;
            return seconds.ToString();
        }
    }
}
