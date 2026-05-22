using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdConfigProvider : ISteamCmdConfigProvider
    {
        private readonly SteamCmdConfigRepository repository;

        public SteamCmdConfigProvider(SteamCmdConfigRepository repository)
        {
            this.repository = repository;
        }

        public SteamcmdEntity GetSettings()
        {
            return repository.Load();
        }

        public void SaveSettings(SteamcmdEntity settings)
        {
            repository.Save(settings);
        }
    }
}
