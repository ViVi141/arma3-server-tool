using System;
using System.Collections.Generic;
using Arma3ServerTools.Application.Agent;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.ProcessManagement;
using Arma3ServerTools.Application.Repositories;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Application.Session;
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
            RconQuickProbe rconQuickProbe,
            ServerConfigSessionStore sessions,
            ConfigPersistenceService persistence,
            DefaultConfigPersistenceSettingsProvider persistenceSettings,
            AgentSettingsService agentSettings,
            AgentScheduledTaskService agentScheduledTasks)
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
            Sessions = sessions;
            Persistence = persistence;
            PersistenceSettings = persistenceSettings;
            AgentSettings = agentSettings;
            AgentScheduledTasks = agentScheduledTasks;
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

        public ServerConfigSessionStore Sessions { get; }

        public ConfigPersistenceService Persistence { get; }

        public DefaultConfigPersistenceSettingsProvider PersistenceSettings { get; }

        public AgentSettingsService AgentSettings { get; }

        public AgentScheduledTaskService AgentScheduledTasks { get; }

        public string CurrentServerUuid { get; set; }

        public Dictionary<string, ArmaServerConfig> LoadedConfigs { get; } =
            new Dictionary<string, ArmaServerConfig>();

        public ArmaServerConfig GetCurrentConfig()
        {
            ServerConfigSession session = GetCurrentSession();
            if (session == null)
            {
                return null;
            }

            return session.Model;
        }

        public ServerConfigSession GetCurrentSession()
        {
            if (string.IsNullOrEmpty(CurrentServerUuid))
            {
                return null;
            }

            ServerConfigSession session;
            if (Sessions.TryGet(CurrentServerUuid, out session))
            {
                LoadedConfigs[CurrentServerUuid] = session.Model;
                return session;
            }

            ArmaServerConfig config;
            if (LoadedConfigs.TryGetValue(CurrentServerUuid, out config) && config != null)
            {
                return EnsureSession(config);
            }

            return Sessions.GetOrLoad(CurrentServerUuid);
        }

        public ServerConfigSession EnsureSession(ArmaServerConfig config)
        {
            if (config == null || string.IsNullOrEmpty(config.ServerUUID))
            {
                return null;
            }

            ServerConfigSession session = Sessions.GetOrLoad(config.ServerUUID);
            if (session == null)
            {
                session = new ServerConfigSession(config);
                Sessions.Register(session);
            }
            else if (!ReferenceEquals(session.Model, config))
            {
                session.ReplaceModel(config, markSaved: false);
            }

            LoadedConfigs[config.ServerUUID] = session.Model;
            return session;
        }

        public bool TryGetSession(string serverUuid, out ServerConfigSession session)
        {
            return Sessions.TryGet(serverUuid, out session);
        }

        public void SyncPersistenceSettingsFromUi()
        {
            AppUiSettings ui = AppUiSettings.Instance;
            PersistenceSettings.Update(new ConfigPersistenceSettings
            {
                AutoSnapshotMode = ui.AutoSnapshotMode,
                AutoSnapshotAsync = ui.AutoSnapshotAsync,
            });
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
