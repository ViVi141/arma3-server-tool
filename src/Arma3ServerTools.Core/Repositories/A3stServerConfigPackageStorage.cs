using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Security;
using Newtonsoft.Json.Linq;

namespace Arma3ServerTools.Core.Repositories
{
    /// <summary>
    /// Tool-native config layout: config/{serverUuid}/*.json (split package). Legacy flat config/{uuid}.json is migrated on read/save.
    /// </summary>
    internal sealed class A3stServerConfigPackageStorage
    {
        private const int MaxServerUuidLength = 128;
        private readonly IAppPaths paths;

        public A3stServerConfigPackageStorage(IAppPaths paths)
        {
            this.paths = paths;
        }

        public IReadOnlyList<ServerListItem> List()
        {
            return LoadAll()
                .Select(pair => ToListItem(pair.Value))
                .OrderBy(item => item.ConfigName)
                .ToList();
        }

        public IReadOnlyDictionary<string, ArmaServerConfig> LoadAll()
        {
            var result = new Dictionary<string, ArmaServerConfig>(StringComparer.Ordinal);
            if (!Directory.Exists(paths.ConfigDirectory))
            {
                return result;
            }

            foreach (string directory in Directory.GetDirectories(paths.ConfigDirectory))
            {
                string serverUuid = Path.GetFileName(directory);
                if (!IsPackageDirectory(directory))
                {
                    continue;
                }

                ArmaServerConfig config = LoadPackage(serverUuid);
                if (config != null && !string.IsNullOrEmpty(config.ServerUUID))
                {
                    result[config.ServerUUID] = config;
                }
            }

            foreach (string filePath in Directory.GetFiles(paths.ConfigDirectory, "*" + ToolConstants.LegacyConfigFileExtension))
            {
                string serverUuid = Path.GetFileNameWithoutExtension(filePath);
                if (result.ContainsKey(serverUuid))
                {
                    continue;
                }

                ArmaServerConfig config = LoadLegacyFile(filePath);
                if (config != null && !string.IsNullOrEmpty(config.ServerUUID))
                {
                    result[config.ServerUUID] = config;
                }
            }

            return result;
        }

        public ArmaServerConfig Get(string serverUuid)
        {
            EnsureValidServerUuid(serverUuid);
            string packageDir = GetPackageDirectory(serverUuid);
            if (IsPackageDirectory(packageDir))
            {
                return LoadPackage(serverUuid);
            }

            string legacyPath = GetLegacyFilePath(serverUuid);
            if (File.Exists(legacyPath))
            {
                return LoadLegacyFile(legacyPath);
            }

            throw new ConfigException("找不到服务器配置: " + serverUuid);
        }

        public void Save(ArmaServerConfig config)
        {
            if (config == null)
            {
                throw new ConfigException("配置不能为空。");
            }

            if (string.IsNullOrEmpty(config.ServerUUID))
            {
                throw new ConfigException("服务器 UUID 不能为空。");
            }

            EnsureValidServerUuid(config.ServerUUID);
            config.SetTime();
            Directory.CreateDirectory(paths.ConfigDirectory);

            ServerConfigSecretProtector.ProtectSecrets(config);
            try
            {
                WritePackage(config);
                DeleteLegacyFileIfPresent(config.ServerUUID);
            }
            finally
            {
                ServerConfigSecretProtector.UnprotectSecrets(config);
            }
        }

        public void Delete(string serverUuid)
        {
            EnsureValidServerUuid(serverUuid);
            string packageDir = GetPackageDirectory(serverUuid);
            if (Directory.Exists(packageDir))
            {
                Directory.Delete(packageDir, true);
            }

            string legacyPath = GetLegacyFilePath(serverUuid);
            if (File.Exists(legacyPath))
            {
                File.Delete(legacyPath);
            }
        }

        public bool Exists(string serverUuid)
        {
            EnsureValidServerUuid(serverUuid);
            if (IsPackageDirectory(GetPackageDirectory(serverUuid)))
            {
                return true;
            }

            return File.Exists(GetLegacyFilePath(serverUuid));
        }

        public bool TryPatchProcessId(string serverUuid, int processId)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                return false;
            }

            EnsureValidServerUuid(serverUuid);
            string tasksPath = Path.Combine(GetPackageDirectory(serverUuid), ToolConstants.ToolConfigTasksFileName);
            if (File.Exists(tasksPath))
            {
                return TryPatchProcessIdInTasksFile(tasksPath, processId);
            }

            string legacyPath = GetLegacyFilePath(serverUuid);
            if (File.Exists(legacyPath))
            {
                return TryPatchProcessIdInLegacyFile(legacyPath, processId);
            }

            return false;
        }

        private bool IsPackageDirectory(string directoryPath)
        {
            if (string.IsNullOrEmpty(directoryPath) || !Directory.Exists(directoryPath))
            {
                return false;
            }

            return File.Exists(Path.Combine(directoryPath, ToolConstants.ToolConfigManifestFileName));
        }

        private ArmaServerConfig LoadPackage(string serverUuid)
        {
            string packageDir = GetPackageDirectory(serverUuid);
            try
            {
                string manifestJson = File.ReadAllText(
                    Path.Combine(packageDir, ToolConstants.ToolConfigManifestFileName),
                    GameConfigFormat.Utf8NoBom);
                A3stConfigManifest manifest = JsonSerializer.FromJson<A3stConfigManifest>(manifestJson);
                if (manifest == null)
                {
                    throw new ConfigException("manifest.json 无效。");
                }

                var config = new ArmaServerConfig
                {
                    ServerUUID = manifest.ServerUUID ?? serverUuid,
                    ConfigName = manifest.ConfigName,
                    ServerDir = manifest.ServerDir,
                    CreateTime = manifest.CreateTime,
                    SaveTime = manifest.SaveTime,
                    x64 = manifest.x64,
                    AutoCopyBikey = manifest.AutoCopyBikey,
                    StartCommandLine = manifest.StartCommandLine,
                };

                config.ServerConfig = ReadJsonFile<ServerConfig>(packageDir, ToolConstants.ToolConfigServerFileName)
                    ?? new ServerConfig();
                config.StartupParameters = ReadJsonFile<StartupParameters>(packageDir, ToolConstants.ToolConfigStartupFileName)
                    ?? new StartupParameters();
                A3stModsFile modsFile = ReadJsonFile<A3stModsFile>(packageDir, ToolConstants.ToolConfigModsFileName);
                if (modsFile != null && modsFile.modsEntities != null)
                {
                    config.StartupParameters.modsEntities = modsFile.modsEntities;
                }
                else
                {
                    config.StartupParameters.modsEntities = new List<ModsEntity>();
                }

                config.BasicConfig = ReadJsonFile<ServerBasic>(packageDir, ToolConstants.ToolConfigBasicFileName)
                    ?? new ServerBasic();
                config.BattlEyeConfig = ReadJsonFile<BattlEye>(packageDir, ToolConstants.ToolConfigBattlEyeFileName)
                    ?? new BattlEye();
                config.serverProfile = ReadJsonFile<ServerProfile>(packageDir, ToolConstants.ToolConfigProfileFileName)
                    ?? new ServerProfile();
                config.ServerTaskManagement = ReadJsonFile<ServerManagement>(packageDir, ToolConstants.ToolConfigTasksFileName)
                    ?? new ServerManagement();
                config.MissionParams = ReadJsonFile<Dictionary<string, string>>(
                    packageDir,
                    ToolConstants.ToolConfigMissionParamsFileName)
                    ?? new Dictionary<string, string>(StringComparer.Ordinal);

                ServerConfigSecretProtector.UnprotectSecrets(config);
                return config;
            }
            catch (ConfigException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new ConfigException("读取配置包失败: " + packageDir, ex);
            }
        }

        private void WritePackage(ArmaServerConfig config)
        {
            string packageDir = GetPackageDirectory(config.ServerUUID);
            Directory.CreateDirectory(packageDir);

            var manifest = new A3stConfigManifest
            {
                FormatVersion = ToolConstants.ToolConfigFormatVersion,
                ServerUUID = config.ServerUUID,
                ConfigName = config.ConfigName,
                ServerDir = config.ServerDir,
                CreateTime = config.CreateTime,
                SaveTime = config.SaveTime,
                x64 = config.x64,
                AutoCopyBikey = config.AutoCopyBikey,
                StartCommandLine = config.StartCommandLine,
            };

            WriteJsonFile(packageDir, ToolConstants.ToolConfigManifestFileName, manifest);
            WriteJsonFile(packageDir, ToolConstants.ToolConfigServerFileName, config.ServerConfig ?? new ServerConfig());
            WriteJsonFile(packageDir, ToolConstants.ToolConfigBasicFileName, config.BasicConfig ?? new ServerBasic());
            WriteJsonFile(packageDir, ToolConstants.ToolConfigBattlEyeFileName, config.BattlEyeConfig ?? new BattlEye());
            WriteJsonFile(packageDir, ToolConstants.ToolConfigProfileFileName, config.serverProfile ?? new ServerProfile());
            WriteJsonFile(packageDir, ToolConstants.ToolConfigTasksFileName, config.ServerTaskManagement ?? new ServerManagement());
            WriteJsonFile(
                packageDir,
                ToolConstants.ToolConfigMissionParamsFileName,
                config.MissionParams ?? new Dictionary<string, string>(StringComparer.Ordinal));

            StartupParameters startup = config.StartupParameters ?? new StartupParameters();
            StartupParameters startupWithoutMods = CloneStartupWithoutMods(startup);
            WriteJsonFile(packageDir, ToolConstants.ToolConfigStartupFileName, startupWithoutMods);

            var modsFile = new A3stModsFile();
            if (startup.modsEntities != null)
            {
                modsFile.modsEntities = startup.modsEntities;
            }

            WriteJsonFile(packageDir, ToolConstants.ToolConfigModsFileName, modsFile);
        }

        private static StartupParameters CloneStartupWithoutMods(StartupParameters source)
        {
            string json = JsonSerializer.ToCompactJson(source);
            StartupParameters clone = JsonSerializer.FromJson<StartupParameters>(json);
            if (clone == null)
            {
                clone = new StartupParameters();
            }

            clone.modsEntities = new List<ModsEntity>();
            return clone;
        }

        private static T ReadJsonFile<T>(string packageDir, string fileName)
            where T : class
        {
            string path = Path.Combine(packageDir, fileName);
            if (!File.Exists(path))
            {
                return null;
            }

            string json = File.ReadAllText(path, GameConfigFormat.Utf8NoBom);
            return JsonSerializer.FromJson<T>(json);
        }

        private static void WriteJsonFile(string packageDir, string fileName, object data)
        {
            string path = Path.Combine(packageDir, fileName);
            File.WriteAllText(path, JsonSerializer.ToCompactJson(data), GameConfigFormat.Utf8NoBom);
        }

        private ArmaServerConfig LoadLegacyFile(string filePath)
        {
            try
            {
                string json = File.ReadAllText(filePath, GameConfigFormat.Utf8NoBom);
                ArmaServerConfig config = JsonSerializer.FromJson<ArmaServerConfig>(json);
                if (config != null)
                {
                    ServerConfigSecretProtector.UnprotectSecrets(config);
                }

                return config;
            }
            catch (Exception ex)
            {
                throw new ConfigException("读取配置失败: " + filePath, ex);
            }
        }

        private void DeleteLegacyFileIfPresent(string serverUuid)
        {
            string legacyPath = GetLegacyFilePath(serverUuid);
            if (File.Exists(legacyPath))
            {
                File.Delete(legacyPath);
            }
        }

        private static bool TryPatchProcessIdInTasksFile(string tasksPath, int processId)
        {
            try
            {
                string json = File.ReadAllText(tasksPath, GameConfigFormat.Utf8NoBom);
                JObject root = JObject.Parse(json);
                root["ProcessById"] = processId;
                File.WriteAllText(
                    tasksPath,
                    root.ToString(Newtonsoft.Json.Formatting.None),
                    GameConfigFormat.Utf8NoBom);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static bool TryPatchProcessIdInLegacyFile(string filePath, int processId)
        {
            try
            {
                string json = File.ReadAllText(filePath, GameConfigFormat.Utf8NoBom);
                JObject root = JObject.Parse(json);
                JToken management = root["ServerTaskManagement"];
                if (management == null)
                {
                    root["ServerTaskManagement"] = new JObject
                    {
                        ["ProcessById"] = processId,
                    };
                }
                else
                {
                    JObject managementObject = management as JObject;
                    if (managementObject == null)
                    {
                        return false;
                    }

                    managementObject["ProcessById"] = processId;
                }

                File.WriteAllText(
                    filePath,
                    root.ToString(Newtonsoft.Json.Formatting.None),
                    GameConfigFormat.Utf8NoBom);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private string GetPackageDirectory(string serverUuid)
        {
            return Path.Combine(paths.ConfigDirectory, serverUuid);
        }

        private string GetLegacyFilePath(string serverUuid)
        {
            return Path.Combine(paths.ConfigDirectory, serverUuid + ToolConstants.LegacyConfigFileExtension);
        }

        private static void EnsureValidServerUuid(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                throw new ConfigException("服务器 UUID 不能为空。");
            }

            if (serverUuid.Length > MaxServerUuidLength)
            {
                throw new ConfigException("服务器 UUID 格式非法。");
            }

            for (int i = 0; i < serverUuid.Length; i++)
            {
                if (!IsSafeFileTokenChar(serverUuid[i]))
                {
                    throw new ConfigException("服务器 UUID 格式非法。");
                }
            }
        }

        private static bool IsSafeFileTokenChar(char value)
        {
            if (value >= '0' && value <= '9')
            {
                return true;
            }

            if (value >= 'a' && value <= 'z')
            {
                return true;
            }

            if (value >= 'A' && value <= 'Z')
            {
                return true;
            }

            if (value == '-' || value == '_')
            {
                return true;
            }

            return false;
        }

        private static ServerListItem ToListItem(ArmaServerConfig config)
        {
            return new ServerListItem
            {
                ConfigName = config.ConfigName,
                ServerUuid = config.ServerUUID,
                FileName = config.ServerUUID,
                SaveTime = config.SaveTime,
                CreateTime = config.CreateTime,
            };
        }
    }
}
