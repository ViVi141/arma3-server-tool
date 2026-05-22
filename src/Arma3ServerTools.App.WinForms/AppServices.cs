using System;
using System.Collections.Generic;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Repositories;
using Arma3ServerTools.Application.ProcessManagement;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;

namespace Arma3ServerTools.App.WinForms
{
    internal sealed class AppServices
    {
        private static AppServices instance;

        private AppServices()
        {
            Paths = new AppPaths(AppContext.BaseDirectory);

            var repository = new ServerConfigRepository(Paths);
            SteamCmdConfigRepository = new SteamCmdConfigRepository(Paths);
            ModuleScanPathRepository = new ModuleScanPathRepository(Paths);
            PlayerDatabaseRepository = new PlayerDatabaseRepository(Paths);

            SteamCmdConfigProvider = new SteamCmdConfigProvider(SteamCmdConfigRepository);
            ConfigService = new ServerConfigService(repository);
            ConfigWriter = new GameConfigWriterAdapter();
            ProcessRunner = new SystemProcessRunner();
            ProcessService = new ServerProcessService(
                ConfigService,
                ConfigWriter,
                ProcessRunner,
                MonitoringDeploymentService);
            SchedulerService = new SchedulerService(ProcessService);
            SteamCmdService = new SteamCmdService(Paths, SteamCmdConfigProvider, ProcessRunner);
            ModScannerService = new ModScannerService(ModuleScanPathRepository);
            BikeyService = new BikeyService();
            BansService = new BansService();
            MonitoringDeploymentService = new MonitoringDeploymentService(Paths);
            MonitoringHealthChecker = new MonitoringHealthChecker(MonitoringDeploymentService, Paths);
            PreflightChecker = new ServerPreflightChecker(MonitoringDeploymentService);
            RptLogService = new RptLogService();

            MonitoringDatabase = new MonitoringDatabase(Paths);
            MonitoringQueryService = new MonitoringQueryService(MonitoringDatabase);
            PlayerDirectoryService = new PlayerDirectoryService(PlayerDatabaseRepository);
            RconService = new RconService();
            RconQuickProbe = new RconQuickProbe();
        }

        public static AppServices Instance
        {
            get
            {
                if (instance == null)
                {
                    instance = new AppServices();
                }

                return instance;
            }
        }

        public IAppPaths Paths { get; }

        public SteamCmdConfigRepository SteamCmdConfigRepository { get; }

        public ModuleScanPathRepository ModuleScanPathRepository { get; }

        public PlayerDatabaseRepository PlayerDatabaseRepository { get; }

        public SteamCmdConfigProvider SteamCmdConfigProvider { get; }

        public IServerConfigService ConfigService { get; }

        public IGameConfigWriter ConfigWriter { get; }

        public IProcessRunner ProcessRunner { get; }

        public IServerProcessService ProcessService { get; }

        public ISchedulerService SchedulerService { get; }

        public ISteamCmdService SteamCmdService { get; }

        public ModScannerService ModScannerService { get; }

        public BikeyService BikeyService { get; }

        public BansService BansService { get; }

        public MonitoringDeploymentService MonitoringDeploymentService { get; }

        public MonitoringHealthChecker MonitoringHealthChecker { get; }

        public ServerPreflightChecker PreflightChecker { get; }

        public RptLogService RptLogService { get; }

        public MonitoringDatabase MonitoringDatabase { get; }

        public MonitoringQueryService MonitoringQueryService { get; }

        public PlayerDirectoryService PlayerDirectoryService { get; }

        public IRconService RconService { get; }

        public RconQuickProbe RconQuickProbe { get; }

        public string CurrentServerUuid { get; set; }

        public Dictionary<string, ArmaServerConfig> LoadedConfigs { get; } = new Dictionary<string, ArmaServerConfig>();

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
