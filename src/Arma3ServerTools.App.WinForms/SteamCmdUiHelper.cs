using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.App.WinForms
{
    internal static class SteamCmdUiHelper
    {
        public static async Task<bool> EnsureSteamCmdAvailableAsync(
            IWin32Window owner,
            ISteamCmdService steamCmdService,
            IAppPaths paths = null)
        {
            OperationResult check = await steamCmdService
                .EnsureSteamCmdAvailableAsync(false, CancellationToken.None)
                .ConfigureAwait(true);
            if (check.Success)
            {
                return true;
            }

            string extensionDirectory = ResolveExtensionDirectory(paths);
            if (!AntdUiHelper.Confirm(
                owner,
                "缺少 SteamCMD",
                check.Message + Environment.NewLine + Environment.NewLine
                    + "是否从 Steam 官方源自动下载并安装到以下目录？" + Environment.NewLine
                    + extensionDirectory))
            {
                return false;
            }

            AntdUiHelper.ShowInfo(owner, "正在下载 SteamCMD，请稍候...", "请稍候");

            check = await steamCmdService
                .EnsureSteamCmdAvailableAsync(true, CancellationToken.None)
                .ConfigureAwait(true);

            if (check.Success)
            {
                if (!string.IsNullOrEmpty(check.Message))
                {
                    AntdUiHelper.ShowInfo(owner, check.Message, "SteamCMD 已就绪");
                }

                return true;
            }

            AntdUiHelper.ShowError(owner, check.Message, "失败");
            return false;
        }

        public static async Task<OperationResult> DownloadSteamCmdAsync(
            IWin32Window owner,
            ISteamCmdService steamCmdService,
            IAppPaths paths = null)
        {
            OperationResult check = await steamCmdService
                .EnsureSteamCmdAvailableAsync(false, CancellationToken.None)
                .ConfigureAwait(true);
            if (check.Success)
            {
                return check;
            }

            AntdUiHelper.ShowInfo(
                owner,
                "正在下载 SteamCMD 到：" + Environment.NewLine + ResolveExtensionDirectory(paths),
                "请稍候");

            return await steamCmdService
                .EnsureSteamCmdAvailableAsync(true, CancellationToken.None)
                .ConfigureAwait(true);
        }

        public static async Task<bool> TryDownloadWorkshopModsAsync(
            IWin32Window owner,
            ISteamCmdService steamCmdService,
            IAppPaths paths,
            IList<ulong> modIds)
        {
            if (modIds == null || modIds.Count == 0)
            {
                AntdUiHelper.ShowInfo(owner, "没有需要下载的 Workshop 模组。", "提示");
                return false;
            }

            if (!await EnsureSteamCmdAvailableAsync(owner, steamCmdService, paths).ConfigureAwait(true))
            {
                return false;
            }

            OperationResult result = steamCmdService.DownloadWorkshopItems(modIds);
            if (result.Success)
            {
                AntdUiHelper.ShowInfo(owner, result.Message, "SteamCMD 已启动");
                return true;
            }

            AntdUiHelper.ShowError(owner, result.Message, "下载失败");
            return false;
        }

        private static string ResolveExtensionDirectory(IAppPaths paths)
        {
            if (paths == null)
            {
                return SteamCmdBootstrapper.GetBundledDirectory(
                    new AppPaths(AppContext.BaseDirectory));
            }

            return SteamCmdBootstrapper.GetBundledDirectory(paths);
        }
    }
}
