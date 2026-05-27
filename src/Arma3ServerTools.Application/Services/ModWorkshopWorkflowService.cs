using System.Collections.Generic;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    /// <summary>
    /// Headless Workshop mod download/enable (shared by Agent and WinForms).
    /// </summary>
    public sealed class ModWorkshopWorkflowService
    {
        private readonly IAppPaths paths;
        private readonly ISteamCmdService steamCmdService;
        private readonly ISteamCmdConfigProvider steamCmdConfigProvider;
        private readonly ModEnablerService modEnablerService;
        private readonly BikeyService bikeyService;
        private readonly IServerConfigService configService;

        public ModWorkshopWorkflowService(
            IAppPaths paths,
            ISteamCmdService steamCmdService,
            ISteamCmdConfigProvider steamCmdConfigProvider,
            ModEnablerService modEnablerService,
            BikeyService bikeyService,
            IServerConfigService configService)
        {
            this.paths = paths;
            this.steamCmdService = steamCmdService;
            this.steamCmdConfigProvider = steamCmdConfigProvider;
            this.modEnablerService = modEnablerService;
            this.bikeyService = bikeyService;
            this.configService = configService;
        }

        public OperationResult DownloadMods(IList<ulong> modIds, bool ensureSteamCmd)
        {
            return DownloadMods(modIds, ensureSteamCmd, false, 3600, out _);
        }

        public OperationResult DownloadMods(
            IList<ulong> modIds,
            bool ensureSteamCmd,
            bool captureSteamCmdOutput,
            int steamCmdTimeoutSeconds,
            out SteamCmdRunResult capturedResult)
        {
            capturedResult = null;
            if (modIds == null || modIds.Count == 0)
            {
                return OperationResult.Fail("没有模组 ID。");
            }

            if (ensureSteamCmd)
            {
                OperationResult ensure = steamCmdService.EnsureSteamCmdAvailable(true);
                if (!ensure.Success)
                {
                    return ensure;
                }
            }

            if (captureSteamCmdOutput)
            {
                int timeoutMs = steamCmdTimeoutSeconds * 1000;
                if (timeoutMs < 1000)
                {
                    timeoutMs = 3600000;
                }

                capturedResult = steamCmdService.DownloadWorkshopItemsCaptured(modIds, timeoutMs);
                if (!capturedResult.Success)
                {
                    return OperationResult.Fail(BuildCapturedDownloadMessage(capturedResult, modIds.Count));
                }

                return OperationResult.Ok(
                    "SteamCMD 已下载 " + modIds.Count + " 个 Workshop 模组（已捕获输出）。");
            }

            return steamCmdService.DownloadWorkshopItems(modIds);
        }

        private static string BuildCapturedDownloadMessage(SteamCmdRunResult captured, int modCount)
        {
            string message = captured.Message;
            if (captured.RequiresSteamGuard)
            {
                message = "SteamCMD 需要 Steam Guard 验证（共 " + modCount + " 个模组，请勿拆成多次下载）。"
                    + System.Environment.NewLine
                    + message;
            }

            string tail = captured.TailForDisplay(3000);
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

        public OperationResult EnableHtmlModsOnServer(
            ArmaServerConfig config,
            IList<LauncherHtmlModEntry> entries)
        {
            if (config == null)
            {
                return OperationResult.Fail("配置为空。");
            }

            if (entries == null || entries.Count == 0)
            {
                return OperationResult.Fail("没有可启用的模组。");
            }

            SteamcmdEntity steam = steamCmdConfigProvider.GetSettings();
            string workshopRoot = SteamCmdPathHelper.NormalizeWorkshopRoot(paths, steam.d);
            if (string.IsNullOrWhiteSpace(workshopRoot))
            {
                return OperationResult.Fail("Workshop 根目录未配置。");
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
            string message = "已启用 " + applyResult.AppliedCount + " 个模组。";
            if (applyResult.MissingOnDisk.Count > 0)
            {
                message += " 仍有 " + applyResult.MissingOnDisk.Count + " 个未在磁盘找到。";
            }

            return OperationResult.Ok(message);
        }
    }
}
