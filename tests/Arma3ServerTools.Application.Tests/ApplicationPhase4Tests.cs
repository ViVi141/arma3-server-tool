using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class BansServiceTests
    {
        [Fact]
        public void SaveLoadLocalBans_WritesAllBanPaths()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3bans-local");
            try
            {
                string serverDir = Path.Combine(root, "server");
                string uuid = "ban-test-uuid";
                var service = new BansService();
                var bans = new List<LocalBansEntity>
                {
                    new LocalBansEntity("76561198000000001", "永久封禁", "cheat", string.Empty, string.Empty),
                    new LocalBansEntity("10.0.0.1", "2026-12-31", "grief", string.Empty, string.Empty),
                };

                OperationResult saveResult = service.SaveLocalBans(serverDir, uuid, bans);
                Assert.True(saveResult.Success, saveResult.Message);

                IReadOnlyList<LocalBansEntity> loaded = service.LoadLocalBans(serverDir, uuid);
                Assert.Equal(2, loaded.Count);
                Assert.Contains(loaded, ban => ban.GUID == "76561198000000001" && ban.Time == "永久封禁");
                Assert.True(File.Exists(Path.Combine(serverDir, "bans.txt")));
                Assert.True(File.Exists(Path.Combine(serverDir, @"destiny_serverconfig\" + uuid + @"\BattlEye\bans.txt")));
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void SaveLoadLocalBans_ParsesPermanentBanMarker()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3bans-permanent");
            try
            {
                string serverDir = Path.Combine(root, "server");
                string uuid = "ban-permanent-uuid";
                string bansPath = Path.Combine(serverDir, "bans.txt");
                Directory.CreateDirectory(serverDir);
                File.WriteAllText(bansPath, "76561198000000001 -1 cheat");

                var service = new BansService();
                IReadOnlyList<LocalBansEntity> loaded = service.LoadLocalBans(serverDir, uuid);

                Assert.Single(loaded);
                Assert.Equal("永久封禁", loaded[0].Time);
                Assert.Equal("cheat", loaded[0].Reason);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }

    public class ModScannerServiceTests
    {
        [Fact]
        public void Scan_DiscoversModsAndPreservesSavedFlags()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-scan");
            try
            {
                string workshopRoot = Path.Combine(root, "workshop", "107410");
                string modPath = Path.Combine(workshopRoot, "1234567890");
                AutomatedTestWorkspace.CreateSampleMod(modPath, "Scanned Mod", 1234567890);

                var scanPathRepository = new ModuleScanPathRepository(new AppPaths(root));
                scanPathRepository.Save(new List<ModuleScanPathEntity>
                {
                    new ModuleScanPathEntity(workshopRoot, string.Empty, "test"),
                });

                var config = new ArmaServerConfig
                {
                    StartupParameters = new StartupParameters
                    {
                        modsEntities = new List<ModsEntity>
                        {
                            new ModsEntity(modPath, "1234567890", "Scanned Mod", 1234567890, false, true, false, false),
                        },
                    },
                };

                var scanner = new ModScannerService(scanPathRepository);
                List<ScannedModRow> rows = scanner.Scan(config, new SteamcmdEntity());

                Assert.Single(rows);
                Assert.Equal(1234567890, rows[0].ModId);
                Assert.True(rows[0].ServerMod);
                Assert.Equal("Scanned Mod", rows[0].ModName);
                Assert.False(rows[0].InputLocalMod);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void Scan_ForcesInputLocalModFalse_ForWorkshopPathsEvenWhenSavedTrue()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-workshop-local-flag");
            try
            {
                string workshopRoot = Path.Combine(root, "steam", "steamapps", "workshop", "content", "107410");
                string modPath = Path.Combine(workshopRoot, "1234567890");
                AutomatedTestWorkspace.CreateSampleMod(modPath, "Workshop Mod", 1234567890);

                var scanPathRepository = new ModuleScanPathRepository(new AppPaths(root));
                scanPathRepository.Save(new List<ModuleScanPathEntity>
                {
                    new ModuleScanPathEntity(workshopRoot, string.Empty, "test"),
                });

                var config = new ArmaServerConfig
                {
                    StartupParameters = new StartupParameters
                    {
                        modsEntities = new List<ModsEntity>
                        {
                            new ModsEntity(modPath, "1234567890", "Workshop Mod", 1234567890, true, false, false, true),
                        },
                    },
                };

                var scanner = new ModScannerService(scanPathRepository);
                List<ScannedModRow> rows = scanner.Scan(config, new SteamcmdEntity { d = Path.Combine(root, "steam") });

                Assert.Single(rows);
                Assert.False(rows[0].InputLocalMod);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void EnsureDefaultWorkshopPath_AddsConfiguredWorkshopDirectory()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mod-default-path");
            try
            {
                string workshopDir = Path.Combine(root, "steam", "steamapps", "workshop", "content", "107410");
                Directory.CreateDirectory(workshopDir);

                var scanPathRepository = new ModuleScanPathRepository(new AppPaths(root));
                var scanner = new ModScannerService(scanPathRepository);
                var steamcmd = new SteamcmdEntity { d = Path.Combine(root, "steam") };

                scanner.EnsureDefaultWorkshopPath(steamcmd);
                IList<ModuleScanPathEntity> paths = scanner.GetScanPaths();

                Assert.Single(paths);
                Assert.Equal(workshopDir, paths[0].ModulePath);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }

    public class BikeyServiceTests
    {
        [Fact]
        public void CopyBikeysForMod_CopiesToServerKeysDirectory()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3bikey");
            try
            {
                string serverDir = Path.Combine(root, "server");
                string modPath = Path.Combine(root, "mods", "@TestMod");
                Directory.CreateDirectory(Path.Combine(modPath, "keys"));
                File.WriteAllText(Path.Combine(modPath, "keys", "author.bikey"), "bikey");

                var config = new ArmaServerConfig
                {
                    ServerDir = serverDir,
                    AutoCopyBikey = true,
                };
                var mod = new ModsEntity(modPath, "@TestMod", "Test Mod", 0, true, false, false, false);
                var service = new BikeyService();

                OperationResult result = service.CopyBikeysForMod(config, mod);

                Assert.True(result.Success, result.Message);
                List<string> keys = service.ListServerBikeys(serverDir);
                Assert.NotEmpty(keys);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }

    public class SteamCmdServicePhase4Tests
    {
        [Fact]
        public void EnsureSteamCmdAvailable_WithBundledExe_Succeeds()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3steam-ensure");
            try
            {
                AutomatedTestWorkspace.CreateBundledSteamCmd(root);
                var service = new SteamCmdService(
                    new AppPaths(root),
                    new InlineSteamCmdConfig(new SteamcmdEntity()),
                    new FakeProcessRunner());

                OperationResult result = service.EnsureSteamCmdAvailable(false);

                Assert.True(result.Success, result.Message);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }

    public class EndToEndSmokeTests
    {
        [Fact]
        public void CreateSaveWriteCfgStartStop_FullPipeline()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3e2e-smoke");
            try
            {
                AutomatedTestWorkspace.CopySqlSchema(root);
                string serverDir = Path.Combine(root, "server");
                AutomatedTestWorkspace.CreateFakeDedicatedServer(serverDir);

                var paths = new AppPaths(root);
                var configService = new ServerConfigService(new ServerConfigRepository(paths));
                ArmaServerConfig config = configService.Create("E2E Smoke", serverDir);
                config.StartupParameters.Port = 2602;
                config.ServerConfig.HostName = "E2E Automated";
                configService.Save(config);

                var runner = new FakeProcessRunner();
                var processService = new ServerProcessService(
                    configService,
                    new GameConfigWriterAdapter(),
                    runner);

                OperationResult writeResult = new GameConfigWriterAdapter().WriteAll(configService.Get(config.ServerUUID));
                Assert.True(writeResult.Success, writeResult.Message);

                string cfgPath = Path.Combine(
                    serverDir,
                    @"destiny_serverconfig\" + config.ServerUUID + @"\server.cfg");
                Assert.True(File.Exists(cfgPath));
                Assert.Contains("E2E Automated", File.ReadAllText(cfgPath));

                OperationResult startResult = processService.Start(config.ServerUUID);
                Assert.True(startResult.Success, startResult.Message);
                Assert.Equal(ServerRunState.Running, processService.GetState(config.ServerUUID));

                OperationResult stopResult = processService.Stop(config.ServerUUID);
                Assert.True(stopResult.Success, stopResult.Message);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }
}
