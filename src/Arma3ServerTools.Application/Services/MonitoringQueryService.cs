using System;
using System.Collections.Generic;
using Arma3ServerTools.Application.Monitoring;

namespace Arma3ServerTools.Application.Services
{
    public sealed class MonitoringQueryService
    {
        private readonly MonitoringDatabase database;

        public MonitoringQueryService(MonitoringDatabase database)
        {
            this.database = database;
        }

        public int InitPlayerOnlineInfo(string serverUuid)
        {
            return database.InitPlayerOnlineInfo(serverUuid);
        }

        public int DeleteObjectStatsOlderThanOneMonth()
        {
            long unixTimestamp = (DateTime.UtcNow.AddMonths(-1).Ticks - 621355968000000000L) / 10000000L;
            return database.DeleteObjectStatsBeforeTimestamp(unixTimestamp.ToString());
        }

        public List<MonitoringPlayerStatRecord> GetPlayerStats(string serverUuid, int limit)
        {
            return database.QueryPlayerStats(serverUuid, limit);
        }

        public List<MonitoringObjectStatRecord> GetRecentObjectStats(string serverUuid, int limit)
        {
            return database.QueryRecentObjectStats(serverUuid, limit);
        }

        public List<MonitoringObjectStatRecord> GetObjectStatsTimeline(string serverUuid, int limit)
        {
            return database.QueryObjectStatsTimeline(serverUuid, limit);
        }
    }
}
