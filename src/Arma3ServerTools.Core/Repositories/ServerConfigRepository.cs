using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Security;

namespace Arma3ServerTools.Core.Repositories
{
    /// <summary>
    /// Loads and persists per-server JSON configs under config/{uuid}.json.
    /// </summary>
    public sealed class ServerConfigRepository
    {
        private const int MaxServerUuidLength = 128;
        private readonly IAppPaths paths;
        private readonly object fileLock = new object();

        public ServerConfigRepository(IAppPaths paths)
        {
            this.paths = paths;
        }

        public IReadOnlyList<ServerListItem> List()
        {
            lock (fileLock)
            {
                return LoadAll()
                    .Select(pair => ToListItem(pair.Value))
                    .OrderBy(item => item.ConfigName)
                    .ToList();
            }
        }

        public IReadOnlyDictionary<string, ArmaServerConfig> LoadAll()
        {
            lock (fileLock)
            {
                return LoadAllCore();
            }
        }

        public ArmaServerConfig Get(string serverUuid)
        {
            lock (fileLock)
            {
                if (string.IsNullOrEmpty(serverUuid))
                {
                    throw new ConfigException("服务器 UUID 不能为空。");
                }

                EnsureValidServerUuid(serverUuid);
                string filePath = GetFilePath(serverUuid);
                if (!File.Exists(filePath))
                {
                    throw new ConfigException("找不到服务器配置: " + serverUuid);
                }

                return LoadFile(filePath);
            }
        }

        public void Save(ArmaServerConfig config)
        {
            lock (fileLock)
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
                string filePath = GetFilePath(config.ServerUUID);
                ServerConfigSecretProtector.ProtectSecrets(config);
                try
                {
                    File.WriteAllText(filePath, JsonSerializer.ToCompactJson(config), GameConfigFormat.Utf8NoBom);
                }
                finally
                {
                    ServerConfigSecretProtector.UnprotectSecrets(config);
                }
            }
        }

        public void Delete(string serverUuid)
        {
            lock (fileLock)
            {
                if (string.IsNullOrEmpty(serverUuid))
                {
                    throw new ConfigException("服务器 UUID 不能为空。");
                }

                EnsureValidServerUuid(serverUuid);
                string filePath = GetFilePath(serverUuid);
                if (File.Exists(filePath))
                {
                    File.Delete(filePath);
                }
            }
        }

        public bool Exists(string serverUuid)
        {
            lock (fileLock)
            {
                EnsureValidServerUuid(serverUuid);
                return File.Exists(GetFilePath(serverUuid));
            }
        }

        private IReadOnlyDictionary<string, ArmaServerConfig> LoadAllCore()
        {
            var result = new Dictionary<string, ArmaServerConfig>(StringComparer.Ordinal);
            if (!Directory.Exists(paths.ConfigDirectory))
            {
                return result;
            }

            foreach (string filePath in Directory.GetFiles(paths.ConfigDirectory, "*.json"))
            {
                ArmaServerConfig config = LoadFile(filePath);
                if (config == null || string.IsNullOrEmpty(config.ServerUUID))
                {
                    continue;
                }

                result[config.ServerUUID] = config;
            }

            return result;
        }

        private ArmaServerConfig LoadFile(string filePath)
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

        private string GetFilePath(string serverUuid)
        {
            return Path.Combine(paths.ConfigDirectory, serverUuid + ".json");
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
                FileName = config.ServerUUID + ".json",
                SaveTime = config.SaveTime,
                CreateTime = config.CreateTime,
            };
        }
    }
}
