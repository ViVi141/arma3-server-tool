using System;
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
            ISteamCmdService steamCmdService)
        {
            OperationResult check = await Task.Run(
                () => steamCmdService.EnsureSteamCmdAvailable(false)).ConfigureAwait(true);
            if (check.Success)
            {
                return true;
            }

            if (!AntdUiHelper.Confirm(
                owner,
                "缺少 SteamCMD",
                check.Message + Environment.NewLine + Environment.NewLine
                    + "是否从 Steam 官方源自动下载并安装到 extension 目录？"))
            {
                return false;
            }

            AntdUiHelper.ShowInfo(owner, "正在下载 SteamCMD，请稍候...", "请稍候");

            check = await Task.Run(
                () => steamCmdService.EnsureSteamCmdAvailable(true)).ConfigureAwait(true);

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

        public static async Task<OperationResult> DownloadSteamCmdAsync(IWin32Window owner, ISteamCmdService steamCmdService)
        {
            OperationResult check = await Task.Run(
                () => steamCmdService.EnsureSteamCmdAvailable(false)).ConfigureAwait(true);
            if (check.Success)
            {
                return check;
            }

            AntdUiHelper.ShowInfo(owner, "正在下载 SteamCMD，请稍候...", "请稍候");

            return await Task.Run(
                () => steamCmdService.EnsureSteamCmdAvailable(true)).ConfigureAwait(true);
        }
    }
}
