using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Core.Repositories
{
    /// <summary>
    /// Loads and persists per-server JSON configs under config/{uuid}.json.
    /// </summary>
    public sealed class ServerConfigRepository
    {
        private readonly IAppPaths paths;

        public ServerConfigRepository(IAppPaths paths)
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

        public ArmaServerConfig Get(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                throw new ConfigException("服务器 UUID 不能为空。");
            }

            string filePath = GetFilePath(serverUuid);
            if (!File.Exists(filePath))
            {
                throw new ConfigException("找不到服务器配置: " + serverUuid);
            }

            return LoadFile(filePath);
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

            config.SetTime();
            Directory.CreateDirectory(paths.ConfigDirectory);
            string filePath = GetFilePath(config.ServerUUID);
            File.WriteAllText(filePath, JsonSerializer.ToJson(config), GameConfigFormat.Utf8NoBom);
        }

        public void Delete(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                throw new ConfigException("服务器 UUID 不能为空。");
            }

            string filePath = GetFilePath(serverUuid);
            if (File.Exists(filePath))
            {
                File.Delete(filePath);
            }
        }

        public bool Exists(string serverUuid)
        {
            return File.Exists(GetFilePath(serverUuid));
        }

        private ArmaServerConfig LoadFile(string filePath)
        {
            try
            {
                string json = File.ReadAllText(filePath, GameConfigFormat.Utf8NoBom);
                return JsonSerializer.FromJson<ArmaServerConfig>(json);
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
