using Arma3ServerTools.Application.Agent;
using Arma3ServerTools.Core;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class AgentSettingsServiceTests
    {
        [Fact]
        public void ApplyPreset_LocalOnly_UsesLoopback()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3-agent-preset-local");
            try
            {
                IAppPaths paths = new AgentSettingsTestPaths(root);
                var service = new AgentSettingsService(paths, new AgentSettingsRepository(paths));
                var settings = new AgentSettings
                {
                    Http = new AgentHttpSettings
                    {
                        RemoteAccessEnabled = true,
                        ListenHost = "+",
                        ListenPort = 19580,
                    },
                };

                service.ApplyPreset(settings, AgentSetupPreset.LocalOnly);

                Assert.False(settings.Http.RemoteAccessEnabled);
                Assert.Equal("127.0.0.1", settings.Http.ListenHost);
                Assert.Equal("http://127.0.0.1:19580", settings.Http.PublicBaseUrl);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void ApplyPreset_LanOpenClaw_EnablesRemoteListen()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3-agent-preset-lan");
            try
            {
                IAppPaths paths = new AgentSettingsTestPaths(root);
                var service = new AgentSettingsService(paths, new AgentSettingsRepository(paths));
                var settings = new AgentSettings
                {
                    Http = new AgentHttpSettings
                    {
                        ListenPort = 19580,
                    },
                };

                service.ApplyPreset(settings, AgentSetupPreset.LanOpenClaw);

                Assert.True(settings.Http.RemoteAccessEnabled);
                Assert.Equal("+", settings.Http.ListenHost);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        private sealed class AgentSettingsTestPaths : IAppPaths
        {
            public AgentSettingsTestPaths(string userDataDirectory)
            {
                ApplicationBase = userDataDirectory;
                UserDataDirectory = userDataDirectory;
                ConfigDirectory = userDataDirectory + @"\config";
                LogDirectory = userDataDirectory + @"\logs";
            }

            public string ApplicationBase { get; }

            public string UserDataDirectory { get; }

            public string ConfigDirectory { get; }

            public string LogDirectory { get; }
        }
    }
}
