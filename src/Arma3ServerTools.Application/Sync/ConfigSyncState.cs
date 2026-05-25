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

            if (tracker.HasChanges(serverUuid, configAfterApply))
            {
                return ConfigSyncState.Unsaved;
            }

            if (tracker.HasServerCfgDrift(serverUuid, configAfterApply))
            {
                return ConfigSyncState.SavedToToolOnly;
            }

            return ConfigSyncState.FullySynced;
        }
    }
}
