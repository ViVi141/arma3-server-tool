using System;
using System.Collections.Generic;
using Arma3ServerTools.Application.Monitoring;

namespace Arma3ServerTools.Application.Services
{
    public sealed class MonitoringIngestService : IMonitoringIngestService
    {
        private readonly MonitoringDatabase database;

        public MonitoringIngestService(MonitoringDatabase database)
        {
            this.database = database;
        }

        public void Ingest(string rawMessage)
        {
            if (string.IsNullOrWhiteSpace(rawMessage))
            {
                return;
            }

            var serverIdCache = new Dictionary<string, int>(StringComparer.Ordinal);
            if (rawMessage.Contains("|"))
            {
                string[] segments = rawMessage.Split(new[] { '|' }, StringSplitOptions.RemoveEmptyEntries);
                for (int i = 0; i < segments.Length; i++)
                {
                    ProcessSegment(segments[i], serverIdCache);
                }
            }
            else
            {
                ProcessSegment(rawMessage, serverIdCache);
            }
        }

        private void ProcessSegment(string segment, Dictionary<string, int> serverIdCache)
        {
            string[] args = segment.Split(new[] { ':' }, StringSplitOptions.RemoveEmptyEntries);
            if (args.Length == 10 && args[0] == "PlayerInfo")
            {
                int serverId = GetOrCreateServerId(args[1], serverIdCache);
                if (serverId != 0)
                {
                    database.InsertOrUpdatePlayerInfo(serverId, args);
                }

                return;
            }

            if (args.Length == 19 && args[0] == "ObjectManipulationNum")
            {
                int serverId = GetOrCreateServerId(args[1], serverIdCache);
                if (serverId != 0)
                {
                    database.InsertObjectNum(serverId, args);
                }

                return;
            }

            if (args.Length == 4 && args[0] == "UpdateOnlineInfo")
            {
                int serverId = GetOrCreateServerId(args[1], serverIdCache);
                if (serverId != 0)
                {
                    database.UpdatePlayerOnlineInfo(serverId, args);
                }
            }
        }

        private int GetOrCreateServerId(string serverName, Dictionary<string, int> serverIdCache)
        {
            int cachedServerId;
            if (serverIdCache.TryGetValue(serverName, out cachedServerId))
            {
                return cachedServerId;
            }

            int serverId = database.GetOrCreateServerId(serverName);
            if (serverId != 0)
            {
                serverIdCache[serverName] = serverId;
            }

            return serverId;
        }
    }
}
