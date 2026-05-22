using System;
using System.Windows.Forms;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.App.WinForms
{
    internal static class SteamCmdUiHelper
    {
        public static bool EnsureSteamCmdAvailable(IWin32Window owner, ISteamCmdService steamCmdService)
        {
            OperationResult check = steamCmdService.EnsureSteamCmdAvailable(false);
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

            Cursor previousCursor = Cursor.Current;
            try
            {
                Cursor.Current = Cursors.WaitCursor;
                check = steamCmdService.EnsureSteamCmdAvailable(true);
            }
            finally
            {
                Cursor.Current = previousCursor;
            }

            if (check.Success)
            {
                AntdUiHelper.ShowInfo(owner, check.Message, "SteamCMD 已就绪");
                return true;
            }

            AntdUiHelper.ShowError(owner, check.Message, "失败");
            return false;
        }
    }
}
