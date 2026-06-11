using System.Collections.Generic;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Application.Session;
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

            ServerConfigSession session = services.EnsureSession(config);
            return services.Persistence.SavePackage(session);
        }

        /// <summary>
        /// Writes Arma/BattlEye cfg under the server directory only (not the tool config package).
        /// </summary>
        public OperationResult ApplyToServerDirectory(ArmaServerConfig config)
        {
            if (config == null)
            {
                return OperationResult.Fail("未选择服务器配置。");
            }

            ServerConfigSession session = services.EnsureSession(config);
            return services.Persistence.WriteGameCfg(session);
        }

        public OperationResult SaveAndApplyToServerDirectory(ArmaServerConfig config)
        {
            if (config == null)
            {
                return OperationResult.Fail("未选择服务器配置。");
            }

            ServerConfigSession session = services.EnsureSession(config);
            return services.Persistence.SaveAndWrite(session);
        }

        public OperationResult StartServer(ArmaServerConfig config)
        {
            if (config == null)
            {
                return OperationResult.Fail("未选择服务器配置。");
            }

            OperationResult result = services.ProcessService.Start(config);
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

            OperationResult result = services.ProcessService.Stop(config);
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

            ServerRunState runState = services.ProcessService.GetState(config);
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
            ArmaServerConfig latest = services.ConfigService.Get(serverUuid);
            ArmaServerConfig existing;
            if (!services.LoadedConfigs.TryGetValue(serverUuid, out existing) || existing == null)
            {
                services.LoadedConfigs[serverUuid] = latest;
                return;
            }

            existing.ServerTaskManagement = latest.ServerTaskManagement;
            existing.ServerConfig = latest.ServerConfig;
            existing.StartupParameters = latest.StartupParameters;
            existing.BasicConfig = latest.BasicConfig;
            existing.BattlEyeConfig = latest.BattlEyeConfig;
            existing.serverProfile = latest.serverProfile;
            existing.MissionParams = latest.MissionParams;
            existing.SaveTime = latest.SaveTime;
            existing.ServerDir = latest.ServerDir;
            existing.AutoCopyBikey = latest.AutoCopyBikey;
            existing.StartCommandLine = latest.StartCommandLine;
            existing.x64 = latest.x64;
            existing.ServerUUID = latest.ServerUUID;
            existing.ConfigName = latest.ConfigName;
            existing.CreateTime = latest.CreateTime;
        }

        /// <summary>
        /// 从磁盘同步进程 PID 与保存时间，不替换配置子对象，避免覆盖 UI 正在编辑的内存模型。
        /// </summary>
        public void SyncProcessStateToCache(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                return;
            }

            ArmaServerConfig existing;
            if (services.LoadedConfigs.TryGetValue(serverUuid, out existing) && existing != null)
            {
                SyncProcessStateToCache(existing);
                return;
            }

            ArmaServerConfig latest = services.ConfigService.Get(serverUuid);
            services.LoadedConfigs[serverUuid] = latest;
        }

        public void SyncProcessStateToCache(ArmaServerConfig config)
        {
            if (config == null)
            {
                return;
            }

            services.ProcessService.SyncState(config);
        }
    }
}
