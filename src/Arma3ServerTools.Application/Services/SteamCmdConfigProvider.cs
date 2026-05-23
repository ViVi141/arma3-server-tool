using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdConfigProvider : ISteamCmdConfigProvider
    {
        private readonly IAppPaths paths;
        private readonly SteamCmdConfigRepository repository;

        public SteamCmdConfigProvider(IAppPaths paths, SteamCmdConfigRepository repository)
        {
            this.paths = paths;
            this.repository = repository;
        }

        public SteamcmdEntity GetSettings()
        {
            SteamcmdEntity settings = repository.Load();
            NormalizeSettings(settings);
            return settings;
        }

        public void SaveSettings(SteamcmdEntity settings)
        {
            if (settings != null)
            {
                NormalizeSettings(settings);
            }

            repository.Save(settings);
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
