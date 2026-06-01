using System;
using System.Collections.Generic;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.ProcessManagement;
using Arma3ServerTools.Application.Repositories;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.App.WinForms
{
    internal sealed class AppServices : IAppServices
    {
        public AppServices(
            IAppPaths paths,
            ILogger logger,
            SteamCmdConfigRepository steamCmdConfigRepository,
            ModuleScanPathRepository moduleScanPathRepository,
            PlayerDatabaseRepository playerDatabaseRepository,
            ISteamCmdConfigProvider steamCmdConfigProvider,
            IServerConfigService configService,
            IGameConfigWriter configWriter,
            IProcessRunner processRunner,
            IServerProcessService processService,
            ISchedulerService schedulerService,
            ISteamCmdService steamCmdService,
            ModScannerService modScannerService,
            ModWorkshopWorkflowService modWorkshopWorkflow,
            BikeyService bikeyService,
            BansService bansService,
            MonitoringDeploymentService monitoringDeploymentService,
            MonitoringHealthChecker monitoringHealthChecker,
            ServerPreflightChecker preflightChecker,
            ServerDiagnosticsService diagnosticsService,
            ServerConfigSnapshotService snapshotService,
            ModBikeyReadinessService modBikeyReadinessService,
            RptLogService rptLogService,
            MonitoringDatabase monitoringDatabase,
            MonitoringQueryService monitoringQueryService,
            PlayerDirectoryService playerDirectoryService,
            IRconService rconService,
            RconQuickProbe rconQuickProbe)
        {
            Paths = paths;
            Logger = logger;
            SteamCmdConfigRepository = steamCmdConfigRepository;
            ModuleScanPathRepository = moduleScanPathRepository;
            PlayerDatabaseRepository = playerDatabaseRepository;
            SteamCmdConfigProvider = steamCmdConfigProvider;
            ConfigService = configService;
            ConfigWriter = configWriter;
            ProcessRunner = processRunner;
            ProcessService = processService;
            SchedulerService = schedulerService;
            SteamCmdService = steamCmdService;
            ModScannerService = modScannerService;
            ModWorkshopWorkflow = modWorkshopWorkflow;
            BikeyService = bikeyService;
            BansService = bansService;
            MonitoringDeploymentService = monitoringDeploymentService;
            MonitoringHealthChecker = monitoringHealthChecker;
            PreflightChecker = preflightChecker;
            DiagnosticsService = diagnosticsService;
            SnapshotService = snapshotService;
            ModBikeyReadinessService = modBikeyReadinessService;
            RptLogService = rptLogService;
            MonitoringDatabase = monitoringDatabase;
            MonitoringQueryService = monitoringQueryService;
            PlayerDirectoryService = playerDirectoryService;
            RconService = rconService;
            RconQuickProbe = rconQuickProbe;
        }

        public IAppPaths Paths { get; }

        public ILogger Logger { get; }

        public SteamCmdConfigRepository SteamCmdConfigRepository { get; }

        public ModuleScanPathRepository ModuleScanPathRepository { get; }

        public PlayerDatabaseRepository PlayerDatabaseRepository { get; }

        public ISteamCmdConfigProvider SteamCmdConfigProvider { get; }

        public IServerConfigService ConfigService { get; }

        public IGameConfigWriter ConfigWriter { get; }

        public IProcessRunner ProcessRunner { get; }

        public IServerProcessService ProcessService { get; }

        public ISchedulerService SchedulerService { get; }

        public ISteamCmdService SteamCmdService { get; }

        public ModScannerService ModScannerService { get; }

        public ModWorkshopWorkflowService ModWorkshopWorkflow { get; }

        public BikeyService BikeyService { get; }

        public BansService BansService { get; }

        public MonitoringDeploymentService MonitoringDeploymentService { get; }

        public MonitoringHealthChecker MonitoringHealthChecker { get; }

        public ServerPreflightChecker PreflightChecker { get; }

        public ServerDiagnosticsService DiagnosticsService { get; }

        public ServerConfigSnapshotService SnapshotService { get; }

        public ModBikeyReadinessService ModBikeyReadinessService { get; }

        public RptLogService RptLogService { get; }

        public MonitoringDatabase MonitoringDatabase { get; }

        public MonitoringQueryService MonitoringQueryService { get; }

        public PlayerDirectoryService PlayerDirectoryService { get; }

        public IRconService RconService { get; }

        public RconQuickProbe RconQuickProbe { get; }

        public string CurrentServerUuid { get; set; }

        public Dictionary<string, ArmaServerConfig> LoadedConfigs { get; } =
            new Dictionary<string, ArmaServerConfig>();

        public ArmaServerConfig GetCurrentConfig()
        {
            if (string.IsNullOrEmpty(CurrentServerUuid))
            {
                return null;
            }

            ArmaServerConfig config;
            if (LoadedConfigs.TryGetValue(CurrentServerUuid, out config))
            {
                return config;
            }

            return null;
        }

        public SteamcmdEntity GetSteamCmdSettings()
        {
            return SteamCmdConfigProvider.GetSettings();
        }

        public void SaveSteamCmdSettings(SteamcmdEntity settings)
        {
            SteamCmdConfigProvider.SaveSettings(settings);
            SteamCmdService.InvalidateExecutableCache();
        }
    }
}
