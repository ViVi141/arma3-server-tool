using System;
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

            if (rawMessage.Contains("|"))
            {
                string[] segments = rawMessage.Split(new[] { '|' }, StringSplitOptions.RemoveEmptyEntries);
                for (int i = 0; i < segments.Length; i++)
                {
                    ProcessSegment(segments[i]);
                }
            }
            else
            {
                ProcessSegment(rawMessage);
            }
        }

        private void ProcessSegment(string segment)
        {
            string[] args = segment.Split(new[] { ':' }, StringSplitOptions.RemoveEmptyEntries);
            if (args.Length == 10 && args[0] == "PlayerInfo")
            {
                int serverId = database.GetOrCreateServerId(args[1]);
                if (serverId != 0)
                {
                    database.InsertOrUpdatePlayerInfo(serverId, args);
                }

                return;
            }

            if (args.Length == 19 && args[0] == "ObjectManipulationNum")
            {
                int serverId = database.GetOrCreateServerId(args[1]);
                if (serverId != 0)
                {
                    database.InsertObjectNum(serverId, args);
                }

                return;
            }

            if (args.Length == 4 && args[0] == "UpdateOnlineInfo")
            {
                int serverId = database.GetOrCreateServerId(args[1]);
                if (serverId != 0)
                {
                    database.UpdatePlayerOnlineInfo(serverId, args);
                }
            }
        }
    }
}
