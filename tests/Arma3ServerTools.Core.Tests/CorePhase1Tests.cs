using System;
using System.IO;
using System.Text;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Arma3ServerTools.Core.Security;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Core.Tests
{
    public class OperationResultTests
    {
        [Fact]
        public void Ok_ReturnsSuccess()
        {
            OperationResult result = OperationResult.Ok("done");
            Assert.True(result.Success);
            Assert.Equal("done", result.Message);
        }

        [Fact]
        public void Fail_ReturnsFailure()
        {
            OperationResult result = OperationResult.Fail("error");
            Assert.False(result.Success);
            Assert.Equal("error", result.Message);
        }
    }

    public class ServerConfigRepositoryTests
    {
        [Fact]
        public void SaveLoadDelete_RoundTrip()
        {
            string root = CreateTempRoot();
            try
            {
                var paths = new AppPaths(root);
                var repository = new ServerConfigRepository(paths);
                ArmaServerConfig config = CreateSampleConfig(root, "test-server-001");

                repository.Save(config);
                Assert.True(File.Exists(Path.Combine(
                    root,
                    "config",
                    "test-server-001",
                    ToolConstants.ToolConfigManifestFileName)));

                ArmaServerConfig loaded = repository.Get("test-server-001");
                Assert.Equal("测试服", loaded.ConfigName);
                Assert.Equal(2302, loaded.StartupParameters.Port);

                repository.Delete("test-server-001");
                Assert.False(repository.Exists("test-server-001"));
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void LoadAll_ReturnsAllSavedConfigs()
        {
            string root = CreateTempRoot();
            try
            {
                var paths = new AppPaths(root);
                var repository = new ServerConfigRepository(paths);
                repository.Save(CreateSampleConfig(root, "uuid-a"));
                repository.Save(CreateSampleConfig(root, "uuid-b"));

                var all = repository.LoadAll();
                Assert.Equal(2, all.Count);
                Assert.True(all.ContainsKey("uuid-a"));
                Assert.True(all.ContainsKey("uuid-b"));
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void Get_MissingUuid_ThrowsConfigException()
        {
            string root = CreateTempRoot();
            try
            {
                var repository = new ServerConfigRepository(new AppPaths(root));
                Assert.Throws<ConfigException>(() => repository.Get("missing"));
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void Save_ProtectsSensitiveFieldsOnDisk()
        {
            if (!OperatingSystem.IsWindows())
            {
                return;
            }

            string root = CreateTempRoot();
            try
            {
                var paths = new AppPaths(root);
                var repository = new ServerConfigRepository(paths);
                ArmaServerConfig config = CreateSampleConfig(root, "secret-server");
                config.ServerConfig.Password = "plain-server-password";
                config.ServerConfig.ServerCommandPassword = "plain-command-password";
                config.ServerConfig.PasswordAdmin = "plain-admin-password";
                config.BattlEyeConfig.RConPassword = "plain-rcon-password";

                repository.Save(config);
                string packageDir = Path.Combine(root, "config", "secret-server");
                string serverJson = File.ReadAllText(
                    Path.Combine(packageDir, ToolConstants.ToolConfigServerFileName));
                string battlEyeJson = File.ReadAllText(
                    Path.Combine(packageDir, ToolConstants.ToolConfigBattlEyeFileName));
                string rawJson = serverJson + battlEyeJson;
                Assert.DoesNotContain("plain-server-password", rawJson);
                Assert.DoesNotContain("plain-rcon-password", rawJson);
                Assert.Contains("A3ST_ENC:", rawJson);

                ArmaServerConfig loaded = repository.Get("secret-server");
                Assert.Equal("plain-server-password", loaded.ServerConfig.Password);
                Assert.Equal("plain-command-password", loaded.ServerConfig.ServerCommandPassword);
                Assert.Equal("plain-admin-password", loaded.ServerConfig.PasswordAdmin);
                Assert.Equal("plain-rcon-password", loaded.BattlEyeConfig.RConPassword);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void Load_LegacyPlaintextSecrets_StillReadable()
        {
            if (!OperatingSystem.IsWindows())
            {
                return;
            }

            string root = CreateTempRoot();
            try
            {
                var paths = new AppPaths(root);
                Directory.CreateDirectory(paths.ConfigDirectory);
                string filePath = Path.Combine(paths.ConfigDirectory, "legacy-server.json");
                File.WriteAllText(
                    filePath,
                    "{\"ServerUUID\":\"legacy-server\",\"ServerConfig\":{\"Password\":\"legacy-plain-password\"},\"BattlEyeConfig\":{\"RConPassword\":\"legacy-rcon\"}}");

                var repository = new ServerConfigRepository(paths);
                ArmaServerConfig loaded = repository.Get("legacy-server");
                Assert.Equal("legacy-plain-password", loaded.ServerConfig.Password);
                Assert.Equal("legacy-rcon", loaded.BattlEyeConfig.RConPassword);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        private static ArmaServerConfig CreateSampleConfig(string root, string uuid)
        {
            return new ArmaServerConfig
            {
                ServerUUID = uuid,
                ConfigName = "测试服",
                ServerDir = Path.Combine(root, "servers", uuid),
                CreateTime = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                StartupParameters = new StartupParameters { Port = 2302 },
            };
        }

        private static string CreateTempRoot()
        {
            string path = Path.Combine(Path.GetTempPath(), "a3tool-test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(path);
            return path;
        }

        private static void DeleteDirectory(string path)
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
        }
    }

    public class GameConfigWriterTests
    {
        [Fact]
        public void WriteAll_CreatesExpectedConfigFiles()
        {
            string root = Path.Combine(Path.GetTempPath(), "a3tool-cfg-" + Guid.NewGuid().ToString("N"));
            string serverDir = Path.Combine(root, "arma-server");
            Directory.CreateDirectory(serverDir);

            try
            {
                var config = new ArmaServerConfig
                {
                    ServerUUID = "cfg-test-uuid",
                    ConfigName = "CfgTest",
                    ServerDir = serverDir,
                    ServerConfig = new ServerConfig
                    {
                        HostName = "UnitTest Server",
                        MaxPlayers = 20,
                    },
                    BasicConfig = new ServerBasic(),
                    BattlEyeConfig = new BattlEye { RConPassword = "testpass", RConPort = 2310 },
                    serverProfile = new ServerProfile(),
                };

                var writer = new GameConfigWriter();
                OperationResult result = writer.WriteAll(config);

                Assert.True(result.Success, result.Message);

                string basePath = Path.Combine(
                    serverDir,
                    ToolConstants.ServerConfigFolderName + @"\cfg-test-uuid");
                Assert.True(File.Exists(Path.Combine(basePath, "server.cfg")));
                Assert.True(File.Exists(Path.Combine(basePath, "basic.cfg")));
                Assert.True(File.Exists(Path.Combine(basePath, @"BattlEye\BEServer_x64.cfg")));

                string profilePath = Path.Combine(
                    basePath,
                    @"Users\cfg-test-uuid\cfg-test-uuid.Arma3Profile");
                Assert.True(File.Exists(profilePath));
                string profile = File.ReadAllText(profilePath);
                AssertProfileBracesBalanced(profile);
                Assert.Contains("aiLevelPreset=3;", profile);
                int aiPresetIndex = profile.IndexOf("aiLevelPreset=3;", StringComparison.Ordinal);
                int customAiIndex = profile.IndexOf("class CustomAILevel", StringComparison.Ordinal);
                int closeBeforeAi = profile.IndexOf("};", aiPresetIndex, StringComparison.Ordinal);
                Assert.True(closeBeforeAi >= 0 && closeBeforeAi < customAiIndex, "CustomDifficulty 应在 CustomAILevel 之前闭合");

                string serverCfg = File.ReadAllText(Path.Combine(basePath, "server.cfg"));
                Assert.Contains("UnitTest Server", serverCfg);
                Assert.Contains("maxPlayers=20", serverCfg);
            }
            finally
            {
                if (Directory.Exists(root))
                {
                    Directory.Delete(root, true);
                }
            }
        }

        [Fact]
        public void BuildStartCommandLine_ContainsPortAndConfigPaths()
        {
            string serverDir = @"D:\arma\server";
            var config = new ArmaServerConfig
            {
                ServerUUID = "line-test",
                ServerDir = serverDir,
                StartupParameters = new StartupParameters { Port = 2402 },
            };

            var writer = new GameConfigWriter();
            string commandLine = writer.BuildStartCommandLine(config);

            Assert.Contains("-port=2402", commandLine);
            Assert.Contains("line-test", commandLine);
            Assert.Contains("server.cfg", commandLine);
            Assert.NotNull(config.StartCommandLine);
        }

        [Fact]
        public void BuildStartCommandLine_IncludesStartupFlagsAndExtraArgs()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3flags-test");
            try
            {
                string serverDir = Path.Combine(root, "server");
                string clientModDir = Path.Combine(serverDir, "client");
                string serverModDir = Path.Combine(serverDir, "servermod");
                Directory.CreateDirectory(Path.Combine(clientModDir, "addons"));
                Directory.CreateDirectory(Path.Combine(serverModDir, "addons"));

                string extraArgsPlain = "-customFlag=1\r\n-skipIntro";
                string extraArgsEncoded = Convert.ToBase64String(Encoding.Default.GetBytes(extraArgsPlain));

                var config = new ArmaServerConfig
                {
                    ServerUUID = "flags-test",
                    ServerDir = serverDir,
                    StartupParameters = new StartupParameters
                    {
                        AutoInit = true,
                        FilePatching = true,
                        PidFile = "server.pid",
                        Ranking = "rank.log",
                        Port = 2302,
                        BandwidthAlg = true,
                        EnableHT = true,
                        Hugepages = true,
                        LoadMissionToMemory = true,
                        DisableServerThread = true,
                        CpuCount = 4,
                        ExThreads = 2,
                        MaxMem = 8192,
                        LimitFPS = 60,
                        NoLogs = true,
                        Netlog = true,
                        DLCWS = true,
                        DLCVN = true,
                        DLCCSLA = true,
                        DLCGM = true,
                        DLCcontact = true,
                        StartConfigArgs = extraArgsEncoded,
                        modsEntities = new System.Collections.Generic.List<ModsEntity>
                        {
                            new ModsEntity(clientModDir, "client", "Client", 1, true, false, false, false),
                            new ModsEntity(serverModDir, "servermod", "Server", 2, false, true, false, false),
                        },
                    },
                };

                string commandLine = new GameConfigWriter().BuildStartCommandLine(config);

                Assert.Contains("-autoInit", commandLine);
                Assert.Contains("-filePatching", commandLine);
                Assert.Contains("-pid=server.pid", commandLine);
                Assert.Contains("-ranking=rank.log", commandLine);
                Assert.Contains("-port=2302", commandLine);
                Assert.Contains("-bandwidthAlg=2", commandLine);
                Assert.Contains("-enableHT", commandLine);
                Assert.Contains("-hugepages", commandLine);
                Assert.Contains("-loadMissionToMemory", commandLine);
                Assert.Contains("-disableServerThread", commandLine);
                Assert.Contains("-cpuCount=4", commandLine);
                Assert.Contains("-exThreads=2", commandLine);
                Assert.Contains("-maxMem=8192", commandLine);
                Assert.Contains("-limitFPS=60", commandLine);
                Assert.Contains("-noLogs", commandLine);
                Assert.Contains("-netlog", commandLine);
                Assert.Contains("WS;", commandLine);
                Assert.Contains("VN;", commandLine);
                Assert.Contains("CSLA;", commandLine);
                Assert.Contains("GM;", commandLine);
                Assert.Contains("contact;", commandLine);
                Assert.Contains(@"-mod=", commandLine);
                Assert.Contains(@"-serverMod=", commandLine);
                Assert.Contains("@client", commandLine);
                Assert.Contains("@servermod", commandLine);
                Assert.Contains(@"-customFlag=1", commandLine);
                Assert.Contains("-skipIntro", commandLine);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void BuildStartCommandLine_FiltersUnsafeExtraArgs()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3flags-safe-filter");
            try
            {
                string serverDir = Path.Combine(root, "server");
                Directory.CreateDirectory(serverDir);
                string extraArgsPlain = "-safeFlag=1\r\nunsafeNoDash\r\n-bad|pipe\r\n-good_path=C:\\work\\profile";
                string extraArgsEncoded = Convert.ToBase64String(Encoding.Default.GetBytes(extraArgsPlain));

                var config = new ArmaServerConfig
                {
                    ServerUUID = "safe-filter-test",
                    ServerDir = serverDir,
                    StartupParameters = new StartupParameters
                    {
                        Port = 2302,
                        StartConfigArgs = extraArgsEncoded,
                    },
                };

                string commandLine = new GameConfigWriter().BuildStartCommandLine(config);

                Assert.Contains("-safeFlag=1", commandLine);
                Assert.Contains("-good_path=C:\\work\\profile", commandLine);
                Assert.DoesNotContain("unsafeNoDash", commandLine);
                Assert.DoesNotContain("-bad|pipe", commandLine);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void BuildStartCommandLine_AddsMonitoringModWhenMonitorEnabled()
        {
            var config = new ArmaServerConfig
            {
                ServerUUID = "monitor-test",
                ServerDir = @"D:\arma\server",
                StartupParameters = new StartupParameters { Port = 2302 },
                ServerTaskManagement = new ServerManagement { EnableMonitor = true },
            };

            string commandLine = new GameConfigWriter().BuildStartCommandLine(config);

            Assert.Contains(ToolConstants.MonitoringServerModToken, commandLine);
        }

        [Fact]
        public void WriteAll_EmptyServerDir_ReturnsFailure()
        {
            var writer = new GameConfigWriter();
            OperationResult result = writer.WriteAll(new ArmaServerConfig());
            Assert.False(result.Success);
        }

        private static void AssertProfileBracesBalanced(string profile)
        {
            int openCount = 0;
            int closeCount = 0;
            foreach (char ch in profile)
            {
                if (ch == '{')
                {
                    openCount++;
                }
                else if (ch == '}')
                {
                    closeCount++;
                }
            }

            Assert.Equal(openCount, closeCount);
        }
    }

    public class MachineCodeToolsTests
    {
        [Fact]
        public void GetEncryptionKey_DoesNotThrow()
        {
            string key = MachineCodeTools.GetEncryptionKey();
            Assert.False(string.IsNullOrEmpty(key));
            Assert.EndsWith("383121955", key);
        }

        [Fact]
        public void GetMoAddress_DoesNotThrow()
        {
            string mac = MachineCodeTools.GetMoAddress();
            Assert.NotNull(mac);
        }
    }

    public class SteamCmdConfigRepositoryTests
    {
        [Fact]
        public void SaveLoad_RoundTrip()
        {
            string root = Path.Combine(Path.GetTempPath(), "a3tool-steam-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            try
            {
                var repository = new SteamCmdConfigRepository(new AppPaths(root));
                var settings = new SteamcmdEntity
                {
                    u = "testuser",
                    d = Path.Combine(root, "workshop"),
                };

                repository.Save(settings);
                SteamCmdLoadResult loaded = repository.Load();
                Assert.True(loaded.Success);
                Assert.Equal("testuser", loaded.Settings.u);
                Assert.Equal(settings.d, loaded.Settings.d);
            }
            finally
            {
                if (Directory.Exists(root))
                {
                    Directory.Delete(root, true);
                }
            }
        }

        [Fact]
        public void Load_CorruptFile_ReturnsFailureWithMessage()
        {
            string root = Path.Combine(Path.GetTempPath(), "a3tool-steam-corrupt-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            try
            {
                var repository = new SteamCmdConfigRepository(new AppPaths(root));
                string filePath = Path.Combine(root, "data.json");
                File.WriteAllText(filePath, "not-valid-protected-json");

                SteamCmdLoadResult loaded = repository.Load();
                Assert.False(loaded.Success);
                Assert.NotNull(loaded.ErrorMessage);
                Assert.NotNull(loaded.Settings);
            }
            finally
            {
                if (Directory.Exists(root))
                {
                    Directory.Delete(root, true);
                }
            }
        }
    }

    public class ArmaServerConfigTests
    {
        [Fact]
        public void ResolveToolRoot_FromMonitoringFolder_ReturnsParent()
        {
            string toolRoot = @"D:\tools\Arma3ServerTools";
            string monitoringRoot = Path.Combine(toolRoot, "monitoring");
            Assert.Equal(toolRoot, AppPaths.ResolveToolRoot(monitoringRoot));
            Assert.Equal(toolRoot, AppPaths.ResolveToolRoot(monitoringRoot + Path.DirectorySeparatorChar));
        }

        [Fact]
        public void ResolveToolRoot_FromAgentFolder_ReturnsParent()
        {
            string toolRoot = @"D:\tools\Arma3ServerTools";
            string agentRoot = Path.Combine(toolRoot, "agent");
            Assert.Equal(toolRoot, AppPaths.ResolveToolRoot(agentRoot));
            Assert.Equal(toolRoot, AppPaths.ResolveToolRoot(agentRoot + Path.DirectorySeparatorChar));
        }

        [Fact]
        public void ResolveToolRoot_FromToolRoot_ReturnsSamePath()
        {
            string toolRoot = @"D:\tools\Arma3ServerTools";
            Assert.Equal(toolRoot, AppPaths.ResolveToolRoot(toolRoot));
        }

        [Fact]
        public void AppPaths_WritableInstallRoot_UsesInstallRootForUserData()
        {
            string root = Path.Combine(Path.GetTempPath(), "a3st-paths-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(root);
            try
            {
                var paths = new AppPaths(root);
                Assert.Equal(root, paths.ApplicationBase);
                Assert.Equal(root, paths.UserDataDirectory);
                Assert.Equal(Path.Combine(root, "config"), paths.ConfigDirectory);
                Assert.Equal(Path.Combine(root, "logs"), paths.LogDirectory);
            }
            finally
            {
                if (Directory.Exists(root))
                {
                    Directory.Delete(root, true);
                }
            }
        }

        [Fact]
        public void SetTime_UpdatesSaveTimeWithoutUiDependency()
        {
            var config = new ArmaServerConfig();
            config.SetTime();
            string before = config.SaveTime;

            DateTime deadline = DateTime.UtcNow.AddSeconds(3);
            while (DateTime.UtcNow < deadline)
            {
                System.Threading.Thread.Sleep(50);
                config.SetTime();
                if (!string.Equals(before, config.SaveTime, StringComparison.Ordinal))
                {
                    break;
                }
            }

            Assert.NotEqual(before, config.SaveTime);
            Assert.StartsWith("上次保存于:", config.SaveTime);
        }
    }
}
