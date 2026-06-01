using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Sync
{
    public enum ConfigSyncState
    {
        FullySynced = 0,
        SavedToToolOnly = 1,
        Unsaved = 2,
    }

    public static class ConfigSyncStateEvaluator
    {
        public static ConfigSyncState Evaluate(
            ServerConfigSnapshotTracker tracker,
            string serverUuid,
            ArmaServerConfig configAfterApply)
        {
            if (configAfterApply == null || string.IsNullOrEmpty(serverUuid))
            {
                return ConfigSyncState.FullySynced;
            }

            string currentSnapshot = ServerConfigSnapshotTracker.SerializeForCompare(configAfterApply);
            return Evaluate(tracker, serverUuid, currentSnapshot);
        }

        public static ConfigSyncState Evaluate(
            ServerConfigSnapshotTracker tracker,
            string serverUuid,
            string currentSnapshot)
        {
            if (string.IsNullOrEmpty(serverUuid) || currentSnapshot == null)
            {
                return ConfigSyncState.FullySynced;
            }

            if (tracker.HasChanges(serverUuid, currentSnapshot))
            {
                return ConfigSyncState.Unsaved;
            }

            if (tracker.HasServerCfgDrift(serverUuid, currentSnapshot))
            {
                return ConfigSyncState.SavedToToolOnly;
            }

            return ConfigSyncState.FullySynced;
        }
    }
}
