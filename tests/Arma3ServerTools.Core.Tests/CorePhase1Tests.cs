using System;
using System.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Arma3ServerTools.Core.Security;
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
                Assert.True(File.Exists(Path.Combine(root, "config", "test-server-001.json")));

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
                    @"destiny_serverconfig\cfg-test-uuid");
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
                SteamcmdEntity loaded = repository.Load();
                Assert.Equal("testuser", loaded.u);
                Assert.Equal(settings.d, loaded.d);
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
        public void ResolveToolRoot_FromToolRoot_ReturnsSamePath()
        {
            string toolRoot = @"D:\tools\Arma3ServerTools";
            Assert.Equal(toolRoot, AppPaths.ResolveToolRoot(toolRoot));
        }

        [Fact]
        public void SetTime_UpdatesSaveTimeWithoutUiDependency()
        {
            var config = new ArmaServerConfig();
            string before = config.SaveTime;
            System.Threading.Thread.Sleep(1100);
            config.SetTime();
            Assert.NotEqual(before, config.SaveTime);
            Assert.StartsWith("上次保存于:", config.SaveTime);
        }
    }
}
