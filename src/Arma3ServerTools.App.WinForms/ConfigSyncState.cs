using System.Drawing;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms
{
    internal enum ConfigSyncState
    {
        FullySynced = 0,
        SavedToToolOnly = 1,
        Unsaved = 2,
    }

    internal static class ConfigSyncStateEvaluator
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

        public static Color GetStatusColor(ConfigSyncState state)
        {
            if (state == ConfigSyncState.Unsaved)
            {
                return Color.FromArgb(212, 56, 13);
            }

            if (state == ConfigSyncState.SavedToToolOnly)
            {
                return Color.FromArgb(212, 136, 6);
            }

            return Color.FromArgb(56, 158, 13);
        }

        public static string GetStatusText(ConfigSyncState state, string saveTime)
        {
            if (state == ConfigSyncState.Unsaved)
            {
                return UiLabels.StatusUnsavedChanges;
            }

            if (state == ConfigSyncState.SavedToToolOnly)
            {
                return UiLabels.StatusServerCfgDrift;
            }

            return UiLabels.FormatSyncedStatus(saveTime);
        }
    }
}
