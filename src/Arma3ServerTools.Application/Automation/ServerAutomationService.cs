using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.Application.Automation
{
    public sealed class ServerAutomationService : IServerAutomationService
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

            config.SetTime();
            configService.Save(config);
            return processService.Start(config);
        }

        public OperationResult RestartServer(string serverUuid)
        {
            OperationResult stopResult = StopServer(serverUuid);
            if (!stopResult.Success)
            {
                return stopResult;
            }

            OperationResult writeResult = WriteConfigFiles(serverUuid);
            if (!writeResult.Success)
            {
                return writeResult;
            }

            return StartServer(serverUuid);
        }

        public OperationResult WriteConfigFiles(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return OperationResult.Fail("未找到服务器: " + serverUuid);
            }

            config.SetTime();
            configService.Save(config);
            return configWriter.WriteAll(config);
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
            configService.Save(config);
            OperationResult writeResult = configWriter.WriteAll(config);
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

            return steamCmdService.InstallDedicatedServer(config.ServerDir.Trim());
        }

        private AutomationRunResult ExecuteTaskCore(AutomationTaskDocument task)
        {
            var result = new AutomationRunResult();
            ArmaServerConfig config = ResolveServer(task.ServerUuid, task.ServerName);
            if (config == null)
            {
                result.Success = false;
                result.Message = "未找到目标服务器。请设置 serverUuid 或 serverName。";
                return result;
            }

            result.ServerUuid = config.ServerUUID;
            if (task.Commands == null || task.Commands.Count == 0)
            {
                result.Success = false;
                result.Message = "任务未包含任何命令。";
                return result;
            }

            bool allSuccess = true;
            for (int i = 0; i < task.Commands.Count; i++)
            {
                AutomationCommand command = task.Commands[i];
                AutomationStepResult step = ExecuteCommand(config, command);
                result.Steps.Add(step);
                if (!step.Success)
                {
                    allSuccess = false;
                    result.Message = step.Message;
                    break;
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

        private AutomationStepResult ExecuteCommand(ArmaServerConfig config, AutomationCommand command)
        {
            if (command == null || string.IsNullOrWhiteSpace(command.Action))
            {
                return FailStep("unknown", "命令为空。");
            }

            string action = command.Action.Trim().ToLowerInvariant();
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
                OperationResult modResult = DownloadWorkshopMods(
                    config.ServerUUID,
                    command.ModIds,
                    command.EnableModsOnServer);
                if (modResult.Success && command.ScanModsAfterDownload)
                {
                    SteamcmdEntity steam = steamCmdConfigProvider.GetSettings();
                    modScannerService.Scan(config, steam);
                }

                return ToStep(action, modResult);
            }

            if (action == "update_server")
            {
                return ToStep(action, UpdateDedicatedServer(config.ServerUUID));
            }

            if (action == "save")
            {
                config.SetTime();
                configService.Save(config);
                return OkStep(action, "已保存到工具配置。");
            }

            return FailStep(action, "未知命令: " + action);
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
            configService.Save(config);
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
    }
}
