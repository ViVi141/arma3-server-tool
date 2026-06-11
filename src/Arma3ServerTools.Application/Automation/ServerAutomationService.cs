using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Application.Session;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.Application.Automation
{
    public sealed partial class ServerAutomationService : IServerAutomationService
    {
        private readonly object executionLock = new object();
        private readonly IAppPaths paths;
        private readonly IServerConfigService configService;
        private readonly IServerProcessService processService;
        private readonly IGameConfigWriter configWriter;
        private readonly ISteamCmdService steamCmdService;
        private readonly ISteamCmdConfigProvider steamCmdConfigProvider;
        private readonly ModEnablerService modEnablerService;
        private readonly ModScannerService modScannerService;
        private readonly BikeyService bikeyService;
        private readonly IRconService rconService;
        private readonly IAgentServerAdminService agentAdmin;
        private readonly ModListHtmlImportService modListHtmlImportService;
        private readonly ModWorkshopWorkflowService modWorkshopWorkflow;
        private readonly ServerPreflightChecker preflightChecker;
        private readonly BansService bansService;
        private readonly ISchedulerService schedulerService;
        private readonly AutomationTaskRunTracker taskRunTracker;
        private readonly SteamCmdLogService steamCmdLogService;
        private readonly RptLogService rptLogService;
        private readonly ServerConfigSessionStore sessionStore;
        private readonly ConfigPersistenceService persistence;
        private readonly ILogger logger;

        public ServerAutomationService(
            IAppPaths paths,
            IServerConfigService configService,
            IServerProcessService processService,
            IGameConfigWriter configWriter,
            ISteamCmdService steamCmdService,
            ISteamCmdConfigProvider steamCmdConfigProvider,
            ModEnablerService modEnablerService,
            ModScannerService modScannerService,
            BikeyService bikeyService,
            IRconService rconService,
            IAgentServerAdminService agentAdmin,
            ModListHtmlImportService modListHtmlImportService,
            ModWorkshopWorkflowService modWorkshopWorkflow,
            ServerPreflightChecker preflightChecker,
            BansService bansService,
            ISchedulerService schedulerService,
            AutomationTaskRunTracker taskRunTracker,
            SteamCmdLogService steamCmdLogService,
            RptLogService rptLogService,
            ServerConfigSessionStore sessionStore,
            ConfigPersistenceService persistence,
            ILogger logger)
        {
            this.paths = paths;
            this.configService = configService;
            this.processService = processService;
            this.configWriter = configWriter;
            this.steamCmdService = steamCmdService;
            this.steamCmdConfigProvider = steamCmdConfigProvider;
            this.modEnablerService = modEnablerService;
            this.modScannerService = modScannerService;
            this.bikeyService = bikeyService;
            this.rconService = rconService;
            this.agentAdmin = agentAdmin;
            this.modListHtmlImportService = modListHtmlImportService;
            this.modWorkshopWorkflow = modWorkshopWorkflow;
            this.preflightChecker = preflightChecker;
            this.bansService = bansService;
            this.schedulerService = schedulerService;
            this.taskRunTracker = taskRunTracker;
            this.steamCmdLogService = steamCmdLogService;
            this.rptLogService = rptLogService;
            this.sessionStore = sessionStore;
            this.persistence = persistence;
            this.logger = logger;
        }

        public IReadOnlyList<ServerListItem> ListServers()
        {
            return configService.List();
        }

        public ServerAutomationStatus GetStatus(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return null;
            }

            ServerRunState runState = processService.SyncState(config);
            var status = new ServerAutomationStatus
            {
                ServerUuid = config.ServerUUID,
                ConfigName = config.ConfigName,
                ServerDir = config.ServerDir,
                ProcessId = config.ServerTaskManagement.ProcessById,
                RunState = MapRunState(runState),
            };

            if (config.ServerConfig.missions != null && config.ServerConfig.missions.Count > 0)
            {
                status.ActiveMissionTemplate = config.ServerConfig.missions[0].Template;
            }

            if (config.StartupParameters.modsEntities != null)
            {
                int enabled = 0;
                foreach (ModsEntity mod in config.StartupParameters.modsEntities)
                {
                    if (mod != null && mod.ServerMod)
                    {
                        enabled++;
                    }
                }

                status.EnabledModCount = enabled;
            }

            return status;
        }

        public ArmaServerConfig ResolveServer(string serverUuid, string serverName)
        {
            if (!string.IsNullOrWhiteSpace(serverUuid))
            {
                ArmaServerConfig byUuid = configService.Get(serverUuid);
                if (byUuid != null)
                {
                    return byUuid;
                }
            }

            if (string.IsNullOrWhiteSpace(serverName))
            {
                IReadOnlyList<ServerListItem> all = configService.List();
                if (all.Count == 1)
                {
                    return configService.Get(all[0].ServerUuid);
                }

                return null;
            }

            IReadOnlyList<ServerListItem> items = configService.List();
            for (int i = 0; i < items.Count; i++)
            {
                ServerListItem item = items[i];
                if (item == null)
                {
                    continue;
                }

                if (string.Equals(item.ConfigName, serverName, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(item.ServerUuid, serverName, StringComparison.OrdinalIgnoreCase))
                {
                    return configService.Get(item.ServerUuid);
                }
            }

            return null;
        }

        public Task<AutomationRunResult> ExecuteTaskFileAsync(string filePath, CancellationToken cancellationToken)
        {
            AutomationTaskDocument document = AutomationTaskParser.LoadFromFile(filePath);
            return ExecuteTaskAsync(document, cancellationToken);
        }

        public Task<AutomationRunResult> ExecuteTaskAsync(
            AutomationTaskDocument task,
            CancellationToken cancellationToken)
        {
            if (task == null)
            {
                throw new ArgumentNullException(nameof(task));
            }

            return Task.Run(
                () =>
                {
                    lock (executionLock)
                    {
                        return ExecuteTaskCore(task);
                    }
                },
                cancellationToken);
        }

        public string EnqueueTask(AutomationTaskDocument task)
        {
            if (task == null)
            {
                throw new ArgumentNullException(nameof(task));
            }

            return taskRunTracker.Submit(
                () =>
                {
                    lock (executionLock)
                    {
                        return ExecuteTaskCore(task);
                    }
                });
        }

        public AutomationTaskRunState GetTaskRun(string taskId)
        {
            return taskRunTracker.Get(taskId);
        }

        public OperationResult StopServer(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return OperationResult.Fail("未找到服务器: " + serverUuid);
            }

            return processService.Stop(config);
        }

        public OperationResult StartServer(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return OperationResult.Fail("未找到服务器: " + serverUuid);
            }

            SteamCmdStatusSnapshot steamStatus = steamCmdService.GetSteamCmdStatus();
            if (steamStatus.RunningProcessCount > 0)
            {
                return OperationResult.Fail("SteamCMD 正在运行中，请等待完成或先停止 SteamCMD 再启动服务器。");
            }

            sessionStore.Unload(serverUuid);
            ServerConfigSession session = sessionStore.GetOrLoad(serverUuid);
            if (session == null)
            {
                return OperationResult.Fail("未找到服务器: " + serverUuid);
            }

            OperationResult saveResult = persistence.SavePackage(session);
            if (!saveResult.Success)
            {
                return saveResult;
            }

            config = configService.Get(serverUuid);
            return processService.Start(config);
        }

        public OperationResult RestartServer(string serverUuid)
        {
            OperationResult stopResult = StopServer(serverUuid);
            if (!stopResult.Success)
            {
                return stopResult;
            }

            OperationResult applyResult = WriteConfigFiles(serverUuid);
            if (!applyResult.Success)
            {
                return applyResult;
            }

            return StartServer(serverUuid);
        }

        public OperationResult WriteConfigFiles(string serverUuid)
        {
            sessionStore.Unload(serverUuid);
            ServerConfigSession session = sessionStore.GetOrLoad(serverUuid);
            if (session == null)
            {
                return OperationResult.Fail("未找到服务器: " + serverUuid);
            }

            return persistence.SaveAndWrite(session);
        }

        public OperationResult SwitchMission(
            string serverUuid,
            string missionTemplate,
            int difficulty,
            bool restart)
        {
            if (string.IsNullOrWhiteSpace(missionTemplate))
            {
                return OperationResult.Fail("任务模板名为空。");
            }

            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return OperationResult.Fail("未找到服务器: " + serverUuid);
            }

            if (config.ServerConfig.missions == null)
            {
                config.ServerConfig.missions = new List<MissionsEntity>();
            }

            MissionsEntity existing = FindMission(config, missionTemplate);
            if (existing == null)
            {
                config.ServerConfig.missions.Insert(
                    0,
                    new MissionsEntity(missionTemplate, difficulty, false, false));
            }
            else
            {
                existing.Difficulty = difficulty;
                config.ServerConfig.missions.Remove(existing);
                config.ServerConfig.missions.Insert(0, existing);
            }

            config.SetTime();
            ServerConfigSession session = EnsureAutomationSession(config);
            OperationResult writeResult = persistence.SaveAndWrite(session);
            if (!writeResult.Success)
            {
                return writeResult;
            }

            if (!restart)
            {
                return OperationResult.Ok("已切换任务配置: " + missionTemplate);
            }

            ServerRunState state = processService.GetState(config);
            if (state == ServerRunState.Running)
            {
                OperationResult stopResult = processService.Stop(config);
                if (!stopResult.Success)
                {
                    return stopResult;
                }
            }

            return processService.Start(config);
        }

        public OperationResult DownloadWorkshopMods(
            string serverUuid,
            IList<ulong> modIds,
            bool enableOnServer)
        {
            return DownloadWorkshopMods(serverUuid, modIds, enableOnServer, false, 1800);
        }

        public OperationResult DownloadWorkshopMods(
            string serverUuid,
            IList<ulong> modIds,
            bool enableOnServer,
            bool captureSteamCmdOutput,
            int steamCmdTimeoutSeconds)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return OperationResult.Fail("未找到服务器: " + serverUuid);
            }

            OperationResult ensureResult = steamCmdService.EnsureSteamCmdAvailable(true);
            if (!ensureResult.Success)
            {
                return ensureResult;
            }

            if (captureSteamCmdOutput)
            {
                int timeoutMs = steamCmdTimeoutSeconds * 1000;
                if (timeoutMs < 1000)
                {
                    timeoutMs = 1800000;
                }

                SteamCmdRunResult captured = steamCmdService.DownloadWorkshopItemsCaptured(modIds, timeoutMs);
                if (!captured.Success)
                {
                    return OperationResult.Fail(BuildCapturedFailureMessage(captured));
                }

                string successMessage = "SteamCMD 模组下载完成（已捕获输出）。";
                if (!enableOnServer)
                {
                    return OperationResult.Ok(successMessage);
                }

                return EnableModsAfterDownload(config, modIds, successMessage);
            }

            OperationResult downloadResult = steamCmdService.DownloadWorkshopItems(modIds);
            if (!downloadResult.Success)
            {
                return downloadResult;
            }

            if (!enableOnServer)
            {
                return downloadResult;
            }

            return EnableModsAfterDownload(config, modIds, downloadResult.Message);
        }

        public OperationResult UpdateDedicatedServer(string serverUuid)
        {
            return UpdateDedicatedServer(serverUuid, false, 1800);
        }

        public OperationResult UpdateDedicatedServer(
            string serverUuid,
            bool captureSteamCmdOutput,
            int steamCmdTimeoutSeconds)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return OperationResult.Fail("未找到服务器: " + serverUuid);
            }

            if (string.IsNullOrWhiteSpace(config.ServerDir))
            {
                return OperationResult.Fail("服务器目录未配置。");
            }

            OperationResult ensureResult = steamCmdService.EnsureSteamCmdAvailable(true);
            if (!ensureResult.Success)
            {
                return ensureResult;
            }

            string installDir = config.ServerDir.Trim();
            if (captureSteamCmdOutput)
            {
                int timeoutMs = steamCmdTimeoutSeconds * 1000;
                if (timeoutMs < 1000)
                {
                    timeoutMs = 1800000;
                }

                SteamCmdRunResult captured = steamCmdService.InstallDedicatedServerCaptured(installDir, timeoutMs);
                if (!captured.Success)
                {
                    return OperationResult.Fail(BuildCapturedFailureMessage(captured));
                }

                return OperationResult.Ok(captured.Message);
            }

            return steamCmdService.InstallDedicatedServer(installDir);
        }

        private static string BuildCapturedFailureMessage(SteamCmdRunResult captured)
        {
            string message = captured.Message;
            if (captured.RequiresSteamGuard)
            {
                message = "SteamCMD 等待 Steam Guard 或登录失败。"
                    + " 建议：任务 JSON 设置 \"captureSteamCmdOutput\": false 弹出窗口人工验证，"
                    + "或轮询 GET /api/v1/steamcmd/log。"
                    + System.Environment.NewLine
                    + message;
            }

            string tail = captured.TailForDisplay(4000);
            if (!string.IsNullOrWhiteSpace(tail))
            {
                message = message + System.Environment.NewLine + System.Environment.NewLine + tail;
            }

            if (!string.IsNullOrWhiteSpace(captured.LogFilePath))
            {
                message = message + System.Environment.NewLine + "完整日志: " + captured.LogFilePath;
            }

            return message;
        }

        private AutomationRunResult ExecuteTaskCore(AutomationTaskDocument task)
        {
            var result = new AutomationRunResult();
            ArmaServerConfig config = null;
            if (!TaskStartsWithCreateServer(task))
            {
                config = ResolveServer(task.ServerUuid, task.ServerName);
                if (config == null)
                {
                    result.Success = false;
                    result.Message = "未找到目标服务器。请设置 serverUuid 或 serverName。";
                    return result;
                }

                result.ServerUuid = config.ServerUUID;
            }
            if (task.Commands == null || task.Commands.Count == 0)
            {
                result.Success = false;
                result.Message = "任务未包含任何命令。";
                return result;
            }

            List<AutomationCommand> commands = AutomationCommandCoalescer.Coalesce(task.Commands);
            bool allSuccess = true;
            for (int i = 0; i < commands.Count; i++)
            {
                AutomationCommand command = commands[i];
                AutomationStepResult step = ExecuteCommand(ref config, command, task);
                result.Steps.Add(step);
                if (!step.Success)
                {
                    allSuccess = false;
                    result.Message = step.Message;
                    break;
                }

                if (config != null)
                {
                    result.ServerUuid = config.ServerUUID;
                }
            }

            result.Success = allSuccess;
            if (allSuccess)
            {
                result.Message = "任务执行完成。";
            }

            logger.LogInformation(
                "Automation task finished. server={ServerUuid}, success={Success}, steps={StepCount}",
                result.ServerUuid,
                result.Success,
                result.Steps.Count);

            return result;
        }

        private static bool TaskStartsWithCreateServer(AutomationTaskDocument task)
        {
            if (task.Commands == null || task.Commands.Count == 0)
            {
                return false;
            }

            string action = task.Commands[0].Action;
            if (string.IsNullOrWhiteSpace(action))
            {
                return false;
            }

            return string.Equals(action.Trim(), "create_server", StringComparison.OrdinalIgnoreCase);
        }

        private AutomationStepResult ExecuteCommand(
            ref ArmaServerConfig config,
            AutomationCommand command,
            AutomationTaskDocument task)
        {
            if (command == null || string.IsNullOrWhiteSpace(command.Action))
            {
                return FailStep("unknown", "命令为空。");
            }

            string action = command.Action.Trim().ToLowerInvariant();
            MergeTaskApplyDefaults(task, command);
            if (config == null
                && action != "help"
                && action != "create_server"
                && action != "ensure_steamcmd"
                && action != "stop_steamcmd"
                && action != "kill_steamcmd"
                && action != "steamcmd_status"
                && action != "install_dedicated_server"
                && action != "first_server_setup")
            {
                return FailStep(action, "未选择服务器。");
            }

            if (action == "help")
            {
                return OkStep(action, AutomationHelpText.GetText());
            }

            if (action == "status")
            {
                ServerAutomationStatus status = GetStatus(config.ServerUUID);
                string message = status == null
                    ? "无法读取状态。"
                    : status.ConfigName + " | " + status.RunState + " | PID=" + status.ProcessId
                        + " | 任务=" + status.ActiveMissionTemplate
                        + " | 模组=" + status.EnabledModCount;
                return OkStep(action, message);
            }

            if (action == "stop")
            {
                return ToStep(action, processService.Stop(config));
            }

            if (action == "write_cfg" || action == "apply")
            {
                return ToStep(action, WriteConfigFiles(config.ServerUUID));
            }

            if (action == "start")
            {
                return ToStep(action, StartServer(config.ServerUUID));
            }

            if (action == "restart")
            {
                return ToStep(action, RestartServer(config.ServerUUID));
            }

            if (action == "switch_mission")
            {
                OperationResult missionResult = SwitchMission(
                    config.ServerUUID,
                    command.MissionTemplate,
                    command.MissionDifficulty,
                    command.RestartAfterMission);
                return ToStep(action, missionResult);
            }

            if (action == "rcon_mission")
            {
                return ExecuteRconMission(config, command);
            }

            if (action == "download_mods")
            {
                bool capture = AutomationSteamCmdOptions.ResolveCaptureOutput(task, command);
                int timeoutSeconds = AutomationSteamCmdOptions.ResolveTimeoutSeconds(task, command);
                OperationResult modResult = DownloadWorkshopMods(
                    config.ServerUUID,
                    command.ModIds,
                    command.EnableModsOnServer,
                    capture,
                    timeoutSeconds);
                if (modResult.Success && command.ScanModsAfterDownload)
                {
                    SteamcmdEntity steam = steamCmdConfigProvider.GetSettings();
                    modScannerService.Scan(config, steam);
                }

                AutomationStepResult step;
                if (capture)
                {
                    step = ToStepWithOptionalApply(action, modResult, config, command, task);
                    step.SteamCmdLog = steamCmdLogService.ReadAggregatedLog(300);
                    step.SteamCmdLogFile = steamCmdLogService.GetLatestSessionLogFilePath();
                }
                else
                {
                    step = ToStepWithOptionalApply(action, modResult, config, command, task);
                }

                if (command.CoalescedFromCount > 1)
                {
                    step.Message = "已将 " + command.CoalescedFromCount
                        + " 条 download_mods 合并为一次 SteamCMD（共 "
                        + command.ModIds.Count
                        + " 个 ID）。"
                        + System.Environment.NewLine
                        + step.Message;
                }

                return step;
            }

            if (action == "update_server")
            {
                bool capture = AutomationSteamCmdOptions.ResolveCaptureOutput(task, command);
                int timeoutSeconds = AutomationSteamCmdOptions.ResolveTimeoutSeconds(task, command);
                OperationResult updateResult = UpdateDedicatedServer(
                    config.ServerUUID,
                    capture,
                    timeoutSeconds);
                if (capture)
                {
                    return ToStepWithSteamCmdLog(action, updateResult);
                }

                return ToStep(action, updateResult);
            }

            if (action == "save")
            {
                if (config == null)
                {
                    return FailStep(action, "未选择服务器。");
                }

                config.SetTime();
                ServerConfigSession session = EnsureAutomationSession(config);
                OperationResult saveResult = persistence.SavePackage(session);
                return ToStepWithOptionalApply(action, saveResult, config, command, task);
            }

            return ExecuteExtendedCommand(ref config, action, command, task);
        }

        private AutomationStepResult ExecuteRconMission(ArmaServerConfig config, AutomationCommand command)
        {
            if (string.IsNullOrWhiteSpace(command.RconMissionName))
            {
                return FailStep("rcon_mission", "未指定 rconMissionName。");
            }

            try
            {
                string host = "127.0.0.1";
                if (config.BattlEyeConfig != null && !string.IsNullOrWhiteSpace(config.BattlEyeConfig.RConHost))
                {
                    host = config.BattlEyeConfig.RConHost.Trim();
                }

                int port = config.BattlEyeConfig.RConPort;
                string password = config.BattlEyeConfig.RConPassword;
                rconService.ConnectAsync(host, port, password, CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                rconService.LoadMissionAsync(command.RconMissionName)
                    .GetAwaiter()
                    .GetResult();
                return OkStep("rcon_mission", "已通过 RCon 加载任务: " + command.RconMissionName);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "RCon load mission failed.");
                return FailStep("rcon_mission", ex.Message);
            }
        }

        private OperationResult EnableModsAfterDownload(
            ArmaServerConfig config,
            IList<ulong> modIds,
            string prefixMessage)
        {
            SteamcmdEntity steam = steamCmdConfigProvider.GetSettings();
            string workshopRoot = SteamCmdPathHelper.NormalizeWorkshopRoot(paths, steam.d);
            if (string.IsNullOrWhiteSpace(workshopRoot))
            {
                return OperationResult.Fail(prefixMessage + System.Environment.NewLine + "Workshop 根目录未配置。");
            }

            var entries = new List<LauncherHtmlModEntry>();
            for (int i = 0; i < modIds.Count; i++)
            {
                ulong modId = modIds[i];
                if (modId == 0)
                {
                    continue;
                }

                entries.Add(new LauncherHtmlModEntry
                {
                    ModId = modId,
                    Selected = true,
                    DisplayName = "Workshop " + modId,
                });
            }

            ModEnableApplyResult applyResult = modEnablerService.ApplyHtmlMods(
                config,
                workshopRoot,
                entries,
                ModApplyTarget.Server);
            if (config.AutoCopyBikey)
            {
                foreach (ModsEntity mod in config.StartupParameters.modsEntities)
                {
                    if (mod != null && mod.ServerMod)
                    {
                        bikeyService.CopyBikeysForMod(config, mod);
                    }
                }
            }

            config.SetTime();
            ServerConfigSession session = EnsureAutomationSession(config);
            OperationResult saveResult = persistence.SavePackage(session);
            if (!saveResult.Success)
            {
                return OperationResult.Fail(prefixMessage + System.Environment.NewLine + saveResult.Message);
            }

            string message = prefixMessage + System.Environment.NewLine
                + "已启用 " + applyResult.AppliedCount + " 个模组。";
            if (applyResult.MissingOnDisk.Count > 0)
            {
                message += System.Environment.NewLine
                    + "仍有 " + applyResult.MissingOnDisk.Count + " 个模组未下载完成。";
            }

            return OperationResult.Ok(message);
        }

        private static MissionsEntity FindMission(ArmaServerConfig config, string template)
        {
            if (config.ServerConfig.missions == null)
            {
                return null;
            }

            for (int i = 0; i < config.ServerConfig.missions.Count; i++)
            {
                MissionsEntity mission = config.ServerConfig.missions[i];
                if (mission != null
                    && string.Equals(mission.Template, template, StringComparison.OrdinalIgnoreCase))
                {
                    return mission;
                }
            }

            return null;
        }

        private static ServerRunStateLabel MapRunState(ServerRunState runState)
        {
            if (runState == ServerRunState.Running)
            {
                return ServerRunStateLabel.Running;
            }

            if (runState == ServerRunState.Stopped)
            {
                return ServerRunStateLabel.Stopped;
            }

            return ServerRunStateLabel.Unknown;
        }

        private static AutomationStepResult OkStep(string action, string message)
        {
            return new AutomationStepResult
            {
                Action = action,
                Success = true,
                Message = message,
            };
        }

        private static AutomationStepResult FailStep(string action, string message)
        {
            return new AutomationStepResult
            {
                Action = action,
                Success = false,
                Message = message,
            };
        }

        private static AutomationStepResult ToStep(string action, OperationResult result)
        {
            if (result == null)
            {
                return FailStep(action, "无结果。");
            }

            if (result.Success)
            {
                return OkStep(action, result.Message);
            }

            return FailStep(action, result.Message);
        }

        private static void MergeTaskApplyDefaults(AutomationTaskDocument task, AutomationCommand command)
        {
            if (task == null || command == null)
            {
                return;
            }

            if (task.WriteCfgAfter && !command.WriteCfgAfter)
            {
                command.WriteCfgAfter = true;
            }

            if (task.RestartAfter && !command.RestartAfter)
            {
                command.RestartAfter = true;
            }
        }

        private AutomationStepResult ToStepWithOptionalApply(
            string action,
            OperationResult result,
            ArmaServerConfig config,
            AutomationCommand command,
            AutomationTaskDocument task)
        {
            MergeTaskApplyDefaults(task, command);
            AutomationStepResult step = ToStep(action, result);
            if (!step.Success || config == null || command == null)
            {
                return step;
            }

            if (command.RestartAfter)
            {
                OperationResult restartResult = RestartServer(config.ServerUUID);
                if (!restartResult.Success)
                {
                    return FailStep(action, step.Message + " " + restartResult.Message);
                }

                step.Message = step.Message + " 已重启服务器。";
                return step;
            }

            if (command.WriteCfgAfter)
            {
                ServerConfigSession session = EnsureAutomationSession(config);
                OperationResult applyResult = persistence.SaveAndWrite(session);
                if (!applyResult.Success)
                {
                    return FailStep(action, step.Message + " " + applyResult.Message);
                }

                step.Message = step.Message + " 已应用到服务器目录。";
            }

            return step;
        }

        private AutomationStepResult ToStepWithSteamCmdLog(string action, OperationResult result)
        {
            AutomationStepResult step = ToStep(action, result);
            step.SteamCmdLog = steamCmdLogService.ReadAggregatedLog(300);
            step.SteamCmdLogFile = steamCmdLogService.GetLatestSessionLogFilePath();
            return step;
        }

        private static AutomationStepResult ToGameLogStep(string action, GameLogReadResult logResult)
        {
            if (logResult == null || !logResult.Found)
            {
                string hint = "未找到游戏日志。请确认服务器已运行过且 ServerDir 配置正确。";
                if (logResult != null && !string.IsNullOrWhiteSpace(logResult.Content))
                {
                    hint = logResult.Content;
                }

                return FailStep(action, hint);
            }

            string fileName = logResult.Path;
            int lastSeparator = fileName.LastIndexOf('\\');
            if (lastSeparator < 0)
            {
                lastSeparator = fileName.LastIndexOf('/');
            }

            if (lastSeparator >= 0 && lastSeparator < fileName.Length - 1)
            {
                fileName = fileName.Substring(lastSeparator + 1);
            }

            return new AutomationStepResult
            {
                Action = action,
                Success = true,
                Message = "已读取 " + logResult.Kind + " 日志: " + fileName
                    + "（尾部 " + logResult.TailLines + " 行）",
                GameLogPath = logResult.Path,
                GameLogContent = logResult.Content,
            };
        }

        private ServerConfigSession EnsureAutomationSession(ArmaServerConfig config)
        {
            ServerConfigSession session = sessionStore.GetOrLoad(config.ServerUUID);
            if (session == null)
            {
                session = new ServerConfigSession(config);
                sessionStore.Register(session);
            }
            else if (!ReferenceEquals(session.Model, config))
            {
                session.ReplaceModel(config, markSaved: false);
            }

            return session;
        }
    }
}
