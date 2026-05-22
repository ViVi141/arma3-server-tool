using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class ModEnablerServiceTests
    {
        [Fact]
        public void ApplyHtmlMods_ClientTarget_SetsLocalModOnly()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-enable");
            try
            {
                string workshopRoot = Path.Combine(root, "steam");
                string modPath = Path.Combine(workshopRoot, ModEnablerService.WorkshopContentRelativePath, "450814997");
                Directory.CreateDirectory(Path.Combine(modPath, "addons"));

                var config = new ArmaServerConfig { StartupParameters = new StartupParameters() };
                var service = new ModEnablerService();
                var entries = new List<LauncherHtmlModEntry>
                {
                    new LauncherHtmlModEntry { ModId = 450814997UL, DisplayName = "CBA", Selected = true },
                };

                ModEnableApplyResult result = service.ApplyHtmlMods(config, workshopRoot, entries, ModApplyTarget.Client);

                Assert.Equal(1, result.AppliedCount);
                Assert.Empty(result.MissingOnDisk);
                Assert.True(config.StartupParameters.modsEntities[0].LocalMod);
                Assert.False(config.StartupParameters.modsEntities[0].ServerMod);
                Assert.False(config.StartupParameters.modsEntities[0].HeadlessClientMod);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void ApplyHtmlMods_AllTarget_SetsAllFlags()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-enable-all");
            try
            {
                string workshopRoot = Path.Combine(root, "steam");
                string modPath = Path.Combine(workshopRoot, ModEnablerService.WorkshopContentRelativePath, "463939057");
                Directory.CreateDirectory(modPath);

                var config = new ArmaServerConfig { StartupParameters = new StartupParameters() };
                var service = new ModEnablerService();
                var entries = new List<LauncherHtmlModEntry>
                {
                    new LauncherHtmlModEntry { ModId = 463939057UL, DisplayName = "ACE", Selected = true },
                };

                service.ApplyHtmlMods(config, workshopRoot, entries, ModApplyTarget.All);
                ModsEntity entity = config.StartupParameters.modsEntities[0];
                Assert.True(entity.LocalMod);
                Assert.True(entity.ServerMod);
                Assert.True(entity.HeadlessClientMod);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void ApplyHtmlMods_MissingMod_ReportsMissingOnDisk()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-enable-missing");
            try
            {
                var config = new ArmaServerConfig { StartupParameters = new StartupParameters() };
                var service = new ModEnablerService();
                var entries = new List<LauncherHtmlModEntry>
                {
                    new LauncherHtmlModEntry { ModId = 999999999UL, DisplayName = "Missing", Selected = true },
                };

                ModEnableApplyResult result = service.ApplyHtmlMods(
                    config,
                    Path.Combine(root, "steam"),
                    entries,
                    ModApplyTarget.Server);

                Assert.Equal(0, result.AppliedCount);
                Assert.Single(result.MissingOnDisk);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }

    public class GameConfigWriterModFlagTests
    {
        [Fact]
        public void ApplyHtmlMods_ServerTarget_SetsLocalModForWorkshopMods()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-enable-server");
            try
            {
                string workshopRoot = Path.Combine(root, "steam");
                string modPath = Path.Combine(workshopRoot, ModEnablerService.WorkshopContentRelativePath, "450814997");
                Directory.CreateDirectory(Path.Combine(modPath, "addons"));

                var config = new ArmaServerConfig { StartupParameters = new StartupParameters() };
                var service = new ModEnablerService();
                var entries = new List<LauncherHtmlModEntry>
                {
                    new LauncherHtmlModEntry { ModId = 450814997UL, DisplayName = "CBA", Selected = true },
                };

                service.ApplyHtmlMods(config, workshopRoot, entries, ModApplyTarget.Server);
                ModsEntity entity = config.StartupParameters.modsEntities[0];
                Assert.True(entity.LocalMod);
                Assert.True(entity.ServerMod);
                Assert.False(entity.HeadlessClientMod);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void BuildStartCommandLine_UsesIndependentClientAndServerFlags()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-cmdline");
            try
            {
                string serverDir = Path.Combine(root, "server");
                string clientModDir = Path.Combine(serverDir, "client");
                string serverModDir = Path.Combine(serverDir, "servermod");
                Directory.CreateDirectory(Path.Combine(clientModDir, "addons"));
                Directory.CreateDirectory(Path.Combine(serverModDir, "addons"));

                var config = new ArmaServerConfig
                {
                    ServerUUID = "uuid-test",
                    ServerDir = serverDir,
                    StartupParameters = new StartupParameters
                    {
                        Port = 2302,
                        modsEntities = new List<ModsEntity>
                        {
                            new ModsEntity(clientModDir, "client", "ClientMod", 1, true, false, false, false),
                            new ModsEntity(serverModDir, "servermod", "ServerMod", 2, false, true, false, false),
                        },
                    },
                };

                string commandLine = new GameConfigWriter().BuildStartCommandLine(config);

                Assert.Contains("-mod=", commandLine);
                Assert.Contains("-serverMod=", commandLine);
                Assert.Contains("@client", commandLine);
                Assert.Contains("@servermod", commandLine);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }
}
