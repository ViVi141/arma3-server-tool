using System;
using System.Collections.Generic;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.IO;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;

namespace Arma3ServerTools.Application.Services
{
    public sealed class GameConfigWriterAdapter : IGameConfigWriter
    {
        private readonly GameConfigWriter writer = new GameConfigWriter();

        public OperationResult WriteAll(ArmaServerConfig config)
        {
            return writer.WriteAll(config);
        }

        public string BuildStartCommandLine(ArmaServerConfig config)
        {
            return writer.BuildStartCommandLine(config);
        }

        public string BuildHeadlessClientCommandLine(ArmaServerConfig config)
        {
            return writer.BuildHeadlessClientCommandLine(config);
        }

        public async System.Threading.Tasks.Task<OperationResult> WriteAllAsync(
            ArmaServerConfig config,
            System.Threading.CancellationToken cancellationToken = default)
        {
            return await writer.WriteAllAsync(config, cancellationToken);
        }
    }

    public sealed class ServerConfigService : IServerConfigService
    {
        private readonly ServerConfigRepository repository;

        public ServerConfigService(ServerConfigRepository repository)
        {
            this.repository = repository;
        }

        public IReadOnlyList<ServerListItem> List()
        {
            return repository.List();
        }

        public IReadOnlyDictionary<string, ArmaServerConfig> LoadAll()
        {
            return repository.LoadAll();
        }

        public ArmaServerConfig Get(string serverUuid)
        {
            return repository.Get(serverUuid);
        }

        public void Save(ArmaServerConfig config)
        {
            repository.Save(config);
        }

        public void PatchProcessId(ArmaServerConfig config, int processId)
        {
            if (config == null || string.IsNullOrEmpty(config.ServerUUID))
            {
                return;
            }

            if (config.ServerTaskManagement == null)
            {
                config.ServerTaskManagement = new ServerManagement();
            }

            config.ServerTaskManagement.ProcessById = processId;
            repository.TryPatchProcessId(config.ServerUUID, processId);
        }

        public void Delete(string serverUuid)
        {
            repository.Delete(serverUuid);
        }

        public ArmaServerConfig Create(string name, string serverDir)
        {
            var config = new ArmaServerConfig
            {
                ServerUUID = Guid.NewGuid().ToString("N"),
                ConfigName = name,
                ServerDir = serverDir,
                CreateTime = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
            };
            repository.Save(config);
            return config;
        }

        public ArmaServerConfig Clone(string sourceServerUuid, string newName, string newServerDir)
        {
            if (string.IsNullOrWhiteSpace(sourceServerUuid))
            {
                throw new ConfigException("源服务器 UUID 不能为空。");
            }

            if (string.IsNullOrWhiteSpace(newName))
            {
                throw new ConfigException("新配置名称不能为空。");
            }

            ArmaServerConfig source = repository.Get(sourceServerUuid);
            string json = JsonSerializer.ToJson(source);
            ArmaServerConfig copy = JsonSerializer.FromJson<ArmaServerConfig>(json);
            if (copy == null)
            {
                throw new ConfigException("复制配置失败。");
            }

            copy.ServerUUID = Guid.NewGuid().ToString("N");
            copy.ConfigName = newName.Trim();
            copy.ServerDir = newServerDir;
            copy.CreateTime = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            copy.ServerTaskManagement.ProcessById = 0;
            repository.Save(copy);
            return copy;
        }

        public async System.Threading.Tasks.Task<ArmaServerConfig> GetAsync(
            string serverUuid,
            System.Threading.CancellationToken cancellationToken = default)
        {
            return await System.Threading.Tasks.Task.Run(() => Get(serverUuid), cancellationToken);
        }

        public async System.Threading.Tasks.Task SaveAsync(
            ArmaServerConfig config,
            System.Threading.CancellationToken cancellationToken = default)
        {
            await System.Threading.Tasks.Task.Run(() => Save(config), cancellationToken);
        }

        public async System.Threading.Tasks.Task<IReadOnlyDictionary<string, ArmaServerConfig>> LoadAllAsync(
            System.Threading.CancellationToken cancellationToken = default)
        {
            return await System.Threading.Tasks.Task.Run(() => LoadAll(), cancellationToken);
        }
    }
}
