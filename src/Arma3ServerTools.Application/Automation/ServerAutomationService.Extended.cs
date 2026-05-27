using System;
using System.Collections.Generic;
using System.Threading;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace Arma3ServerTools.Application.Automation
{
    public sealed partial class ServerAutomationService
    {
        private AutomationStepResult ExecuteExtendedCommand(
            ref ArmaServerConfig config,
            string action,
            AutomationCommand command)
        {
            if (action == "ensure_steamcmd")
            {
                OperationResult ensure = steamCmdService.EnsureSteamCmdAvailable(true);
                return ToStep(action, ensure);
            }

            if (action == "install_dedicated_server")
            {
                if (config == null)
                {
                    return FailStep(action, "未选择服务器。");
                }

                if (string.IsNullOrWhiteSpace(config.ServerDir))
                {
                    return FailStep(action, "服务器目录未配置。");
                }

                OperationResult ensure = steamCmdService.EnsureSteamCmdAvailable(true);
                if (!ensure.Success)
                {
                    return ToStep(action, ensure);
                }

                return ToStep(action, steamCmdService.InstallDedicatedServer(config.ServerDir.Trim()));
            }

            if (action == "create_server")
            {
                OperationResult create = agentAdmin.CreateServer(
                    command.CreateServerName,
                    command.CreateServerDir);
                if (!create.Success)
                {
                    return ToStep(action, create);
                }

                string uuid = ExtractServerUuidFromMessage(create.Message);
                if (string.IsNullOrEmpty(uuid))
                {
                    return FailStep(action, "创建成功但无法解析 UUID。");
                }

                config = configService.Get(uuid);
                return OkStep(action, create.Message);
            }

            if (action == "preflight")
            {
                if (config == null)
                {
                    return FailStep(action, "未选择服务器。");
                }

                ServerRunState runState = processService.GetState(config);
                IReadOnlyList<PreflightCheckItem> items = preflightChecker.Check(config, runState);
                bool hasError = preflightChecker.HasBlockingErrors(items);
                string summary = "检查项 " + items.Count + "，阻塞错误=" + hasError;
                if (hasError)
                {
                    return FailStep(action, summary);
                }

                return OkStep(action, summary);
            }

            if (action == "first_server_setup")
            {
                return ExecuteFirstServerSetup(ref config, command);
            }

            if (action == "import_mods_html")
            {
                if (config == null)
                {
                    return FailStep(action, "未选择服务器。");
                }

                if (string.IsNullOrWhiteSpace(command.HtmlContent))
                {
                    return FailStep(action, "htmlContent 为空。");
                }

                (OperationResult result, ModListHtmlImportResult data) = modListHtmlImportService.Import(
                    config.ServerUUID,
                    command.HtmlContent,
                    command.HtmlImportMode);
                string message = result.Message;
                if (data != null)
                {
                    message += " 解析=" + data.ParsedCount;
                }

                if (result.Success)
                {
                    return OkStep(action, message);
                }

                return FailStep(action, message);
            }

            if (action == "scan_mods")
            {
                if (config == null)
                {
                    return FailStep(action, "未选择服务器。");
                }

                SteamcmdEntity steam = steamCmdConfigProvider.GetSettings();
                modScannerService.Scan(config, steam);
                return OkStep(action, "模组扫描完成。");
            }

            if (action == "enable_mods")
            {
                if (config == null)
                {
                    return FailStep(action, "未选择服务器。");
                }

                if (command.ModIds == null || command.ModIds.Count == 0)
                {
                    return FailStep(action, "modIds 为空。");
                }

                var entries = new List<LauncherHtmlModEntry>();
                for (int i = 0; i < command.ModIds.Count; i++)
                {
                    ulong modId = command.ModIds[i];
                    if (modId == 0)
                    {
                        continue;
                    }

                    entries.Add(
                        new LauncherHtmlModEntry
                        {
                            ModId = modId,
                            Selected = true,
                            DisplayName = "Workshop " + modId,
                        });
                }

                return ToStep(action, modWorkshopWorkflow.EnableHtmlModsOnServer(config, entries));
            }

            if (action == "sync_cron_jobs")
            {
                if (config == null)
                {
                    return FailStep(action, "未选择服务器。");
                }

                if (string.IsNullOrWhiteSpace(command.CronJobsJson))
                {
                    return FailStep(action, "cronJobsJson 为空。");
                }

                Dictionary<string, CronEntity> crons = JsonConvert.DeserializeObject<Dictionary<string, CronEntity>>(
                    command.CronJobsJson);
                if (crons == null)
                {
                    return FailStep(action, "无法解析 cronJobsJson。");
                }

                config.ServerTaskManagement.CronEntity = crons;
                config.SetTime();
                configService.Save(config);
                schedulerService.SyncJobsAsync(config.ServerUUID, crons)
                    .GetAwaiter()
                    .GetResult();
                return OkStep(action, "已同步定时任务。");
            }

            if (action == "local_ban_add")
            {
                if (config == null)
                {
                    return FailStep(action, "未选择服务器。");
                }

                if (string.IsNullOrWhiteSpace(command.LocalBanGuid))
                {
                    return FailStep(action, "localBanGuid 为空。");
                }

                IReadOnlyList<LocalBansEntity> bans = bansService.LoadLocalBans(config.ServerDir, config.ServerUUID);
                var list = new List<LocalBansEntity>(bans);
                list.Add(
                    new LocalBansEntity
                    {
                        GUID = command.LocalBanGuid.Trim(),
                        Reason = command.Reason ?? string.Empty,
                        Time = string.IsNullOrWhiteSpace(command.LocalBanExpiry)
                            ? "永久封禁"
                            : command.LocalBanExpiry.Trim(),
                    });
                OperationResult save = bansService.SaveLocalBans(config.ServerDir, config.ServerUUID, list);
                return ToStep(action, save);
            }

            if (action == "local_ban_remove")
            {
                if (config == null)
                {
                    return FailStep(action, "未选择服务器。");
                }

                if (string.IsNullOrWhiteSpace(command.LocalBanGuid))
                {
                    return FailStep(action, "localBanGuid 为空。");
                }

                IReadOnlyList<LocalBansEntity> bans = bansService.LoadLocalBans(config.ServerDir, config.ServerUUID);
                var list = new List<LocalBansEntity>();
                string guid = command.LocalBanGuid.Trim();
                for (int i = 0; i < bans.Count; i++)
                {
                    LocalBansEntity ban = bans[i];
                    if (ban == null)
                    {
                        continue;
                    }

                    if (!string.Equals(ban.GUID, guid, StringComparison.OrdinalIgnoreCase))
                    {
                        list.Add(ban);
                    }
                }

                OperationResult save = bansService.SaveLocalBans(config.ServerDir, config.ServerUUID, list);
                return ToStep(action, save);
            }

            if (action == "rcon_players")
            {
                return ExecuteRconStep(config, action, () =>
                {
                    var players = rconService.GetPlayersAsync().GetAwaiter().GetResult();
                    return OkStep(action, "在线玩家数: " + players.Count);
                });
            }

            if (action == "rcon_kick")
            {
                return ExecuteRconStep(config, action, () =>
                {
                    rconService.KickAsync(command.PlayerId, command.Reason ?? string.Empty)
                        .GetAwaiter()
                        .GetResult();
                    return OkStep(action, "已踢出玩家 " + command.PlayerId);
                });
            }

            if (action == "rcon_ban")
            {
                return ExecuteRconStep(config, action, () =>
                {
                    if (string.IsNullOrWhiteSpace(command.PlayerGuid))
                    {
                        return FailStep(action, "playerGuid 为空。");
                    }

                    rconService.BanGuidPermanentAsync(command.PlayerGuid.Trim(), command.Reason ?? string.Empty)
                        .GetAwaiter()
                        .GetResult();
                    return OkStep(action, "已封禁 GUID。");
                });
            }

            if (action == "rcon_broadcast")
            {
                return ExecuteRconStep(config, action, () =>
                {
                    if (string.IsNullOrWhiteSpace(command.BroadcastMessage))
                    {
                        return FailStep(action, "broadcastMessage 为空。");
                    }

                    rconService.SendMessageAsync(command.BroadcastMessage)
                        .GetAwaiter()
                        .GetResult();
                    return OkStep(action, "已发送公告。");
                });
            }

            if (action == "rcon_lock")
            {
                return ExecuteRconStep(config, action, () =>
                {
                    rconService.LockServerAsync().GetAwaiter().GetResult();
                    return OkStep(action, "服务器已锁定。");
                });
            }

            if (action == "rcon_unlock")
            {
                return ExecuteRconStep(config, action, () =>
                {
                    rconService.UnlockServerAsync().GetAwaiter().GetResult();
                    return OkStep(action, "服务器已解锁。");
                });
            }

            if (action == "read_logs" || action == "read_rpt")
            {
                if (config == null)
                {
                    return FailStep(action, "未选择服务器。");
                }

                string logKind = command.LogKind;
                if (action == "read_rpt")
                {
                    logKind = GameLogKinds.Rpt;
                }

                int tailLines = command.LogTailLines;
                if (tailLines < 1)
                {
                    tailLines = 200;
                }

                GameLogReadResult logResult = rptLogService.ReadGameLog(
                    config,
                    logKind,
                    tailLines,
                    command.LogFileName);
                return ToGameLogStep(action, logResult);
            }

            return FailStep(action, "未知命令: " + action);
        }

        private AutomationStepResult ExecuteFirstServerSetup(ref ArmaServerConfig config, AutomationCommand command)
        {
            AutomationStepResult ensureStep = ExecuteExtendedCommand(
                ref config,
                "ensure_steamcmd",
                new AutomationCommand { Action = "ensure_steamcmd" });
            if (!ensureStep.Success)
            {
                return ensureStep;
            }

            var create = new AutomationCommand
            {
                Action = "create_server",
                CreateServerName = command.CreateServerName,
                CreateServerDir = command.CreateServerDir,
            };
            AutomationStepResult createStep = ExecuteExtendedCommand(ref config, "create_server", create);
            if (!createStep.Success)
            {
                return createStep;
            }

            AutomationStepResult installStep = ExecuteExtendedCommand(
                ref config,
                "install_dedicated_server",
                new AutomationCommand { Action = "install_dedicated_server" });
            if (!installStep.Success)
            {
                return installStep;
            }

            return ExecuteCommand(ref config, new AutomationCommand { Action = "write_cfg" });
        }

        private AutomationStepResult ExecuteRconStep(
            ArmaServerConfig config,
            string action,
            Func<AutomationStepResult> work)
        {
            if (config == null)
            {
                return FailStep(action, "未选择服务器。");
            }

            try
            {
                ConnectRcon(config);
                return work();
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "RCon command failed: {Action}", action);
                return FailStep(action, ex.Message);
            }
        }

        private void ConnectRcon(ArmaServerConfig config)
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
        }

        private static string ExtractServerUuidFromMessage(string message)
        {
            if (string.IsNullOrWhiteSpace(message))
            {
                return string.Empty;
            }

            int index = message.LastIndexOf(':');
            if (index < 0 || index >= message.Length - 1)
            {
                return string.Empty;
            }

            return message.Substring(index + 1).Trim();
        }
    }
}
