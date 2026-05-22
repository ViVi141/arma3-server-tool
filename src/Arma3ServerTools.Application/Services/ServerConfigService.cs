using System;
using System.Collections.Generic;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Config;
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

        public ArmaServerConfig Get(string serverUuid)
        {
            return repository.Get(serverUuid);
        }

        public void Save(ArmaServerConfig config)
        {
            repository.Save(config);
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
    }
}
