using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdConfigProvider : ISteamCmdConfigProvider
    {
        private readonly IAppPaths paths;
        private readonly SteamCmdConfigRepository repository;
        private readonly ILogger logger;

        public SteamCmdConfigProvider(IAppPaths paths, SteamCmdConfigRepository repository)
        {
            this.paths = paths;
            this.repository = repository;
            logger = AppLogging.CreateLogger("SteamCmdConfigProvider");
        }

        public string LastLoadWarning { get; private set; }

        public SteamcmdEntity GetSettings()
        {
            SteamCmdLoadResult result = repository.Load();
            LastLoadWarning = null;
            if (!result.Success)
            {
                LastLoadWarning = result.ErrorMessage;
                logger.LogWarning("{Message}", result.ErrorMessage);
            }

            SteamcmdEntity settings = result.Settings;
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
            LastLoadWarning = null;
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
