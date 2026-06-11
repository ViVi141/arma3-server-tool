using System;
using System.IO;
using Arma3ServerTools.Application.Session;
using Arma3ServerTools.Core.IO;

namespace Arma3ServerTools.App.WinForms
{
    internal sealed class AppUiSettings
    {
        private static AppUiSettings instance = new AppUiSettings();

        public static AppUiSettings Instance
        {
            get { return instance; }
        }

        public bool ShowAdvancedSettings { get; set; }

        /// <summary>
        /// true = compatibility mode (manual refresh reads config/*.json from disk),
        /// false = performance-first mode (runtime uses in-memory loaded configs).
        /// </summary>
        public bool AllowExternalConfigRefresh { get; set; }

        /// <summary>
        /// 是否已显示过托盘最小化提示（首次最小化到托盘时显示）
        /// </summary>
        public bool HasShownTrayMinimizeHint { get; set; }

        public AutoSnapshotMode AutoSnapshotMode { get; set; } = AutoSnapshotMode.BeforeWrite;

        public bool AutoSnapshotAsync { get; set; } = true;

        public static void LoadFrom(string configDirectory)
        {
            instance = LoadInternal(configDirectory);
        }

        public void Save(string configDirectory)
        {
            if (string.IsNullOrEmpty(configDirectory))
            {
                return;
            }

            Directory.CreateDirectory(configDirectory);
            string path = Path.Combine(configDirectory, "ui-settings.json");
            File.WriteAllText(path, JsonSerializer.ToJson(this));
        }

        private static AppUiSettings LoadInternal(string configDirectory)
        {
            var settings = new AppUiSettings();
            if (string.IsNullOrEmpty(configDirectory))
            {
                return settings;
            }

            string path = Path.Combine(configDirectory, "ui-settings.json");
            if (!File.Exists(path))
            {
                return settings;
            }

            try
            {
                AppUiSettings loaded = JsonSerializer.FromJson<AppUiSettings>(File.ReadAllText(path));
                if (loaded != null)
                {
                    return loaded;
                }
            }
            catch
            {
            }

            return settings;
        }
    }
}
