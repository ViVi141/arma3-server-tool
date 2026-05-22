using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdConfigProvider : ISteamCmdConfigProvider
    {
        private readonly SteamCmdConfigRepository repository;
        private SteamcmdEntity cachedSettings;
        private bool settingsLoaded;

        public SteamCmdConfigProvider(SteamCmdConfigRepository repository)
        {
            this.repository = repository;
        }

        public SteamcmdEntity GetSettings()
        {
            if (settingsLoaded)
            {
                return cachedSettings;
            }

            cachedSettings = repository.Load();
            settingsLoaded = true;
            return cachedSettings;
        }

        public void SaveSettings(SteamcmdEntity settings)
        {
            repository.Save(settings);
            cachedSettings = settings;
            settingsLoaded = true;
        }

        public void InvalidateCache()
        {
            settingsLoaded = false;
            cachedSettings = null;
        }
    }
}
