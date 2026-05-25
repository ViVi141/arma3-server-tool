using System.Drawing;
using Arma3ServerTools.Application.Sync;

namespace Arma3ServerTools.App.WinForms
{
    internal static class ConfigSyncStateUi
    {
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
