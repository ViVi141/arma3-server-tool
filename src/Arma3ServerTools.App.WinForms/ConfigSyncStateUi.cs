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

            return Color.FromArgb(56, 158, 13);
        }

        public static string GetStatusText(ConfigSyncState state, string saveTime)
        {
            if (state == ConfigSyncState.Unsaved)
            {
                return UiLabels.StatusUnsavedChanges;
            }

            return UiLabels.FormatSavedStatus(saveTime);
        }
    }
}
