namespace Arma3ServerTools.Application.Session
{
    public sealed class DefaultConfigPersistenceSettingsProvider : IConfigPersistenceSettingsProvider
    {
        private ConfigPersistenceSettings settings = new ConfigPersistenceSettings();

        public ConfigPersistenceSettings GetSettings()
        {
            return settings;
        }

        public void Update(ConfigPersistenceSettings newSettings)
        {
            if (newSettings == null)
            {
                return;
            }

            settings = new ConfigPersistenceSettings
            {
                AutoSnapshotMode = newSettings.AutoSnapshotMode,
                AutoSnapshotAsync = newSettings.AutoSnapshotAsync,
            };
        }
    }
}
