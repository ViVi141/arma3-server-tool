using System;
using System.Collections.Generic;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Sync
{
    public sealed class ServerConfigSnapshotTracker
    {
        private readonly Dictionary<string, string> persistedSnapshots =
            new Dictionary<string, string>(StringComparer.Ordinal);

        public void CapturePersisted(string serverUuid, ArmaServerConfig config)
        {
            if (string.IsNullOrEmpty(serverUuid) || config == null)
            {
                return;
            }

            persistedSnapshots[serverUuid] = SerializeForCompare(config);
        }

        public void CapturePersisted(string serverUuid, string snapshot)
        {
            if (string.IsNullOrEmpty(serverUuid) || snapshot == null)
            {
                return;
            }

            persistedSnapshots[serverUuid] = snapshot;
        }

        public void Remove(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                return;
            }

            persistedSnapshots.Remove(serverUuid);
        }

        public void Clear()
        {
            persistedSnapshots.Clear();
        }

        public bool HasChanges(string serverUuid, ArmaServerConfig configAfterApplyAll)
        {
            return HasChanges(serverUuid, SerializeForCompare(configAfterApplyAll));
        }

        public bool HasChanges(string serverUuid, string currentSnapshot)
        {
            if (string.IsNullOrEmpty(serverUuid) || currentSnapshot == null)
            {
                return false;
            }

            string baseline;
            if (!persistedSnapshots.TryGetValue(serverUuid, out baseline))
            {
                return false;
            }

            return !string.Equals(baseline, currentSnapshot, StringComparison.Ordinal);
        }

        public static string SerializeForCompare(ArmaServerConfig config)
        {
            return ServerConfigCompareSnapshot.Serialize(config);
        }
    }
}
