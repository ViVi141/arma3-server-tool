using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Sync
{
    /// <summary>
    /// Tool config sync only. Game directory cfg files are not tracked.
    /// </summary>
    public enum ConfigSyncState
    {
        Saved = 0,
        Unsaved = 1,
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
                return ConfigSyncState.Saved;
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
                return ConfigSyncState.Saved;
            }

            if (tracker.HasChanges(serverUuid, currentSnapshot))
            {
                return ConfigSyncState.Unsaved;
            }

            return ConfigSyncState.Saved;
        }
    }
}
