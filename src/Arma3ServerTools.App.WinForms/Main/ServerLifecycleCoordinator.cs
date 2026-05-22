using System.Collections.Generic;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.App.WinForms
{
    internal sealed class ServerLifecycleCoordinator
    {
        private readonly IAppServices services;
        private readonly ILogger logger;

        public ServerLifecycleCoordinator(IAppServices services, ILogger logger)
        {
            this.services = services;
            this.logger = logger;
        }

        public OperationResult SaveConfig(ArmaServerConfig config)
        {
            if (config == null)
            {
                return OperationResult.Fail("未选择服务器配置。");
            }

            config.SetTime();
            services.ConfigService.Save(config);
            return OperationResult.Ok();
        }

        public OperationResult WriteConfigFiles(ArmaServerConfig config)
        {
            if (config == null)
            {
                return OperationResult.Fail("未选择服务器配置。");
            }

            config.SetTime();
            services.ConfigService.Save(config);

            OperationResult cfgResult = services.ConfigWriter.WriteAll(config);
            if (!cfgResult.Success)
            {
                return cfgResult;
            }

            return services.MonitoringDeploymentService.DeployIfEnabled(config);
        }

        public OperationResult StartServer(ArmaServerConfig config)
        {
            if (config == null)
            {
                return OperationResult.Fail("未选择服务器配置。");
            }

            config.SetTime();
            services.ConfigService.Save(config);

            OperationResult result = services.ProcessService.Start(config.ServerUUID);
            if (result.Success && config.ServerTaskManagement.EnableMonitoringService)
            {
                TryResetMonitoringOnline(config);
            }

            return result;
        }

        public OperationResult StopServer(ArmaServerConfig config)
        {
            if (config == null)
            {
                return OperationResult.Fail("未选择服务器配置。");
            }

            OperationResult result = services.ProcessService.Stop(config.ServerUUID);
            if (result.Success)
            {
                TryResetMonitoringOnline(config);
            }

            return result;
        }

        public IReadOnlyList<PreflightCheckItem> BuildPreflightItems(ArmaServerConfig config)
        {
            if (config == null)
            {
                return new List<PreflightCheckItem>();
            }

            ServerRunState runState = services.ProcessService.GetState(config.ServerUUID);
            return services.PreflightChecker.Check(config, runState);
        }

        public void TryResetMonitoringOnline(ArmaServerConfig config)
        {
            if (config == null || !config.ServerTaskManagement.EnableMonitoringService)
            {
                return;
            }

            try
            {
                services.MonitoringQueryService.InitPlayerOnlineInfo(config.ServerUUID);
            }
            catch (System.Exception ex)
            {
                logger.LogWarning(
                    ex,
                    "Failed to reset monitoring online info for server {ServerUuid}.",
                    config.ServerUUID);
            }
        }

        public void RefreshCachedConfig(string serverUuid)
        {
            ArmaServerConfig config = services.ConfigService.Get(serverUuid);
            services.LoadedConfigs[serverUuid] = config;
        }
    }
}
