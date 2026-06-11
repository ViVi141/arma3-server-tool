using Arma3ServerTools.Application.Session;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class AgentServerAdminService : IAgentServerAdminService
    {
        private readonly IServerConfigService configService;
        private readonly IServerProcessService processService;
        private readonly ServerConfigSessionStore sessionStore;

        public AgentServerAdminService(
            IServerConfigService configService,
            IServerProcessService processService,
            ServerConfigSessionStore sessionStore)
        {
            this.configService = configService;
            this.processService = processService;
            this.sessionStore = sessionStore;
        }

        public ArmaServerConfig GetConfig(string serverUuid)
        {
            return configService.Get(serverUuid);
        }

        public OperationResult PutConfig(string serverUuid, ArmaServerConfig config)
        {
            if (config == null)
            {
                return OperationResult.Fail("配置为空。");
            }

            if (!string.Equals(config.ServerUUID, serverUuid, System.StringComparison.OrdinalIgnoreCase))
            {
                return OperationResult.Fail("配置 UUID 与路径不一致。");
            }

            config.SetTime();
            configService.Save(config);
            sessionStore.Unload(serverUuid);
            return OperationResult.Ok("已保存配置。");
        }

        public OperationResult PatchConfig(string serverUuid, string patchJson)
        {
            if (string.IsNullOrWhiteSpace(patchJson))
            {
                return OperationResult.Fail("PATCH 内容为空。");
            }

            ArmaServerConfig existing = configService.Get(serverUuid);
            if (existing == null)
            {
                return OperationResult.Fail("未找到服务器: " + serverUuid);
            }

            ArmaServerConfig merged;
            try
            {
                merged = ArmaServerConfigJsonMerge.Merge(existing, patchJson);
            }
            catch (System.Exception ex)
            {
                return OperationResult.Fail("无法合并 PATCH JSON: " + ex.Message);
            }

            merged.ServerUUID = existing.ServerUUID;
            return PutConfig(serverUuid, merged);
        }

        public OperationResult CreateServer(string name, string serverDir)
        {
            if (string.IsNullOrWhiteSpace(name))
            {
                return OperationResult.Fail("服务器名称不能为空。");
            }

            if (string.IsNullOrWhiteSpace(serverDir))
            {
                return OperationResult.Fail("服务器目录不能为空。");
            }

            ArmaServerConfig config = configService.Create(name.Trim(), serverDir.Trim());
            return OperationResult.Ok("已创建服务器: " + config.ServerUUID);
        }

        public OperationResult CloneServer(string sourceUuid, string newName, string newServerDir)
        {
            try
            {
                ArmaServerConfig copy = configService.Clone(sourceUuid, newName, newServerDir);
                return OperationResult.Ok("已复制为: " + copy.ServerUUID);
            }
            catch (ConfigException ex)
            {
                return OperationResult.Fail(ex.Message);
            }
        }

        public OperationResult DeleteServer(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return OperationResult.Fail("未找到服务器: " + serverUuid);
            }

            if (processService.GetState(config) == ServerRunState.Running)
            {
                return OperationResult.Fail("服务器仍在运行，请先停止。");
            }

            configService.Delete(serverUuid);
            return OperationResult.Ok("已删除配置。");
        }

        public OperationResult RenameServer(string serverUuid, string newName)
        {
            if (string.IsNullOrWhiteSpace(newName))
            {
                return OperationResult.Fail("新名称不能为空。");
            }

            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return OperationResult.Fail("未找到服务器: " + serverUuid);
            }

            config.ConfigName = newName.Trim();
            config.SetTime();
            configService.Save(config);
            sessionStore.Unload(serverUuid);
            return OperationResult.Ok("已重命名。");
        }
    }
}
