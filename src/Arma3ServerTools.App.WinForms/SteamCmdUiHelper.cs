using System;
using System.IO;
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

            DialogResult answer = MessageBox.Show(
                owner,
                check.Message + Environment.NewLine + Environment.NewLine
                    + "是否从 Steam 官方源自动下载并安装到 extension 目录？",
                "缺少 SteamCMD",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (answer != DialogResult.Yes)
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
                MessageBox.Show(
                    owner,
                    check.Message,
                    "SteamCMD 已就绪",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information);
                return true;
            }

            MessageBox.Show(owner, check.Message, "失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }
    }
}
