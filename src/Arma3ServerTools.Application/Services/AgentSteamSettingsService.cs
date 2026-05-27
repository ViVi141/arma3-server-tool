using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class AgentSteamSettingsView
    {
        public string Username { get; set; }

        public bool HasPassword { get; set; }

        public string WorkshopRoot { get; set; }

        public string SteamCmdPath { get; set; }

        public string LastLoadWarning { get; set; }
    }

    public sealed class AgentSteamSettingsService
    {
        private readonly ISteamCmdConfigProvider configProvider;

        public AgentSteamSettingsService(ISteamCmdConfigProvider configProvider)
        {
            this.configProvider = configProvider;
        }

        public AgentSteamSettingsView GetRedacted()
        {
            SteamcmdEntity settings = configProvider.GetSettings();
            return new AgentSteamSettingsView
            {
                Username = settings.u,
                HasPassword = !string.IsNullOrEmpty(settings.p),
                WorkshopRoot = settings.d,
                SteamCmdPath = settings.i,
                LastLoadWarning = configProvider.LastLoadWarning,
            };
        }

        public void Save(SteamcmdEntity settings)
        {
            configProvider.SaveSettings(settings);
        }
    }
}
