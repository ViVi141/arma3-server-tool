using System.Collections.Generic;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Repositories;
using Arma3ServerTools.Application.ProcessManagement;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.App.WinForms
{
    internal interface IAppServices
    {
        IAppPaths Paths { get; }

        ILogger Logger { get; }

        SteamCmdConfigRepository SteamCmdConfigRepository { get; }

        ModuleScanPathRepository ModuleScanPathRepository { get; }

        PlayerDatabaseRepository PlayerDatabaseRepository { get; }

        ISteamCmdConfigProvider SteamCmdConfigProvider { get; }

        IServerConfigService ConfigService { get; }

        IGameConfigWriter ConfigWriter { get; }

        IProcessRunner ProcessRunner { get; }

        IServerProcessService ProcessService { get; }

        ISchedulerService SchedulerService { get; }

        ISteamCmdService SteamCmdService { get; }

        ModScannerService ModScannerService { get; }

        BikeyService BikeyService { get; }

        BansService BansService { get; }

        MonitoringDeploymentService MonitoringDeploymentService { get; }

        MonitoringHealthChecker MonitoringHealthChecker { get; }

        ServerPreflightChecker PreflightChecker { get; }

        RptLogService RptLogService { get; }

        MonitoringDatabase MonitoringDatabase { get; }

        MonitoringQueryService MonitoringQueryService { get; }

        PlayerDirectoryService PlayerDirectoryService { get; }

        IRconService RconService { get; }

        RconQuickProbe RconQuickProbe { get; }

        string CurrentServerUuid { get; set; }

        Dictionary<string, ArmaServerConfig> LoadedConfigs { get; }

        ArmaServerConfig GetCurrentConfig();

        SteamcmdEntity GetSteamCmdSettings();

        void SaveSteamCmdSettings(SteamcmdEntity settings);
    }
}
