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

            return steamCmdService.DownloadWorkshopItems(modIds);
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
