using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdConfigProvider : ISteamCmdConfigProvider
    {
        private readonly IAppPaths paths;
        private readonly SteamCmdConfigRepository repository;
        private SteamcmdEntity cachedSettings;
        private bool settingsLoaded;

        public SteamCmdConfigProvider(IAppPaths paths, SteamCmdConfigRepository repository)
        {
            this.paths = paths;
            this.repository = repository;
        }

        public SteamcmdEntity GetSettings()
        {
            if (settingsLoaded)
            {
                return cachedSettings;
            }

            cachedSettings = repository.Load();
            NormalizeSettings(cachedSettings);
            settingsLoaded = true;
            return cachedSettings;
        }

        public void SaveSettings(SteamcmdEntity settings)
        {
            if (settings != null)
            {
                NormalizeSettings(settings);
            }

            repository.Save(settings);
            cachedSettings = settings;
            settingsLoaded = true;
        }

        public void InvalidateCache()
        {
            settingsLoaded = false;
            cachedSettings = null;
        }

        private void NormalizeSettings(SteamcmdEntity settings)
        {
            if (settings == null)
            {
                return;
            }

            settings.d = SteamCmdPathHelper.NormalizeWorkshopRoot(paths, settings.d);
        }
    }
}
