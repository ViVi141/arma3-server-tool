using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Arma3ServerTools.Core.Security;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Core.Tests
{
    public class SecretProtectorTests
    {
        [Fact]
        public void ProtectUnprotect_RoundTrip_PreservesPlainText()
        {
            string plain = "{\"u\":\"testuser\",\"p\":\"secret\"}";
            string protectedText = SecretProtector.Protect(plain);
            string decrypted = SecretProtector.Unprotect(protectedText);

            Assert.Equal(plain, decrypted);
            Assert.StartsWith("DPAPI1:", protectedText, StringComparison.Ordinal);
        }

        [Fact]
        public void Unprotect_LegacyAesFormat_StillWorks()
        {
            string key = MachineCodeTools.GetEncryptionKey();
            string plain = "{\"u\":\"legacy-user\"}";
            string legacy = AesEncryption.Encrypt(plain, key);
            string decrypted = SecretProtector.Unprotect(legacy);

            Assert.Equal(plain, decrypted);
            Assert.True(SecretProtector.UsesLegacyFormat(legacy));
        }
    }

    public class AesEncryptionTests
    {
        [Fact]
        public void EncryptDecrypt_RoundTrip_PreservesJson()
        {
            string key = "01234567890123456789012345678901";
            string plain = "{\"u\":\"testuser\",\"p\":\"secret\",\"d\":\"D:\\\\workshop\"}";

            string encrypted = AesEncryption.Encrypt(plain, key);
            string decrypted = AesEncryption.Decrypt(encrypted, key);

            Assert.Equal(plain, decrypted);
        }
    }

    public class ModuleScanPathRepositoryTests
    {
        [Fact]
        public void SaveLoad_RoundTrip()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3scanpath");
            try
            {
                var repository = new ModuleScanPathRepository(new AppPaths(root));
                var paths = new List<ModuleScanPathEntity>
                {
                    new ModuleScanPathEntity(@"D:\workshop\107410", string.Empty, "Workshop"),
                };

                repository.Save(paths);
                List<ModuleScanPathEntity> loaded = repository.Load();

                Assert.Single(loaded);
                Assert.Equal(@"D:\workshop\107410", loaded[0].ModulePath);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }

    public class ModFileToolsTests
    {
        [Fact]
        public void ReadModMeta_ParsesPublishedIdAndName()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3modmeta");
            try
            {
                string modPath = Path.Combine(root, "@TestMod");
                AutomatedTestWorkspace.CreateSampleMod(modPath, "Test Mod Name", 1234567890);

                ModMeta meta = ModFileTools.ReadModMeta(modPath);

                Assert.NotNull(meta);
                Assert.Equal("Test Mod Name", meta.Name);
                Assert.Equal(1234567890L, meta.PublishedId);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void ListMissionFiles_ReturnsPboFiles()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3missions");
            try
            {
                string missionsDir = Path.Combine(root, "mpmissions");
                Directory.CreateDirectory(missionsDir);
                File.WriteAllText(Path.Combine(missionsDir, "test.Altis.pbo"), string.Empty);
                File.WriteAllText(Path.Combine(missionsDir, "readme.txt"), string.Empty);

                List<FileInfo> missions = ModFileTools.ListMissionFiles(missionsDir);

                Assert.Single(missions);
                Assert.EndsWith(".pbo", missions[0].Name, StringComparison.OrdinalIgnoreCase);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void GetModDirectories_AppliesPrefixFilter()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3moddirs");
            try
            {
                string modsRoot = Path.Combine(root, "mods");
                Directory.CreateDirectory(Path.Combine(modsRoot, "@Alpha"));
                Directory.CreateDirectory(Path.Combine(modsRoot, "Beta"));

                List<string> all = ModFileTools.GetModDirectories(modsRoot, string.Empty);
                List<string> filtered = ModFileTools.GetModDirectories(modsRoot, "@Alpha");

                Assert.Equal(2, all.Count);
                Assert.Single(filtered);
                Assert.Contains("@Alpha", filtered[0]);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }

    public class ConfigPersistenceSmokeTests
    {
        [Fact]
        public void SaveLoad_PreservesPhase4Fields()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3cfg-smoke");
            try
            {
                var repository = new ServerConfigRepository(new AppPaths(root));
                var config = new ArmaServerConfig
                {
                    ServerUUID = "phase4-smoke-uuid",
                    ConfigName = "SmokeTest",
                    ServerDir = Path.Combine(root, "server"),
                    AutoCopyBikey = true,
                    ServerConfig = new ServerConfig
                    {
                        HostName = "Automated Test Server",
                        MaxPlayers = 32,
                        Motd = new List<string> { "line1", "line2" },
                        BattlEye = true,
                    },
                    StartupParameters = new StartupParameters
                    {
                        Port = 2402,
                        DLCcontact = true,
                        modsEntities = new List<ModsEntity>
                        {
                            new ModsEntity(
                                Path.Combine(root, "@TestMod"),
                                "@TestMod",
                                "Test Mod",
                                999888777,
                                false,
                                true,
                                false,
                                false),
                        },
                    },
                    BattlEyeConfig = new BattlEye { RConPassword = "rcon-pass", RConPort = 2315 },
                };

                repository.Save(config);
                ArmaServerConfig loaded = repository.Get("phase4-smoke-uuid");

                Assert.Equal("Automated Test Server", loaded.ServerConfig.HostName);
                Assert.Equal(2402, loaded.StartupParameters.Port);
                Assert.True(loaded.StartupParameters.DLCcontact);
                Assert.Equal("rcon-pass", loaded.BattlEyeConfig.RConPassword);
                Assert.Single(loaded.StartupParameters.modsEntities);
                Assert.Equal(999888777, loaded.StartupParameters.modsEntities[0].ModId);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }
}
