using System;
using System.Collections.Generic;
using System.Text;
using System.Windows.Forms;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms
{
    internal static class ModDownloadUiHelper
    {
        public static bool TryDownloadMods(
            IWin32Window owner,
            IList<ulong> modIds,
            IList<ScannedModRow> scannedRows,
            SteamcmdEntity settings,
            ISteamCmdService steamCmdService)
        {
            return TryDownloadModsInternal(owner, modIds, scannedRows, settings, steamCmdService, null);
        }

        public static bool TryDownloadModsFromHtml(
            IWin32Window owner,
            IList<LauncherHtmlModEntry> htmlEntries,
            SteamcmdEntity settings,
            ISteamCmdService steamCmdService)
        {
            if (htmlEntries == null || htmlEntries.Count == 0)
            {
                MessageBox.Show(owner, "HTML 中未解析到 Workshop 模组 ID。", "读取失败", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            var modIds = new List<ulong>();
            foreach (LauncherHtmlModEntry entry in htmlEntries)
            {
                modIds.Add(entry.ModId);
            }

            return TryDownloadModsInternal(owner, modIds, null, settings, steamCmdService, htmlEntries);
        }

        private static bool TryDownloadModsInternal(
            IWin32Window owner,
            IList<ulong> modIds,
            IList<ScannedModRow> scannedRows,
            SteamcmdEntity settings,
            ISteamCmdService steamCmdService,
            IList<LauncherHtmlModEntry> htmlEntries)
        {
            if (settings == null || string.IsNullOrEmpty(settings.u) || string.IsNullOrEmpty(settings.d))
            {
                MessageBox.Show(owner, "请先配置 SteamCMD 账号和 Workshop 根目录。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return false;
            }

            if (modIds == null || modIds.Count == 0)
            {
                MessageBox.Show(owner, "没有可下载的 Workshop 模组 ID。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return false;
            }

            if (!ConfirmOutsideWorkshopPaths(owner, scannedRows, settings.d))
            {
                return false;
            }

            IList<ulong> confirmedIds;
            using (ModDownloadConfirmForm confirmDialog = CreateConfirmDialog(modIds, htmlEntries))
            {
                if (confirmDialog.ShowDialog(owner) != DialogResult.OK)
                {
                    return false;
                }

                confirmedIds = confirmDialog.GetSelectedModIds();
            }

            if (confirmedIds.Count == 0)
            {
                MessageBox.Show(owner, "请至少选择一个模组。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return false;
            }

            bool? useDirectSteamCmd = AskUseDirectSteamCmd(owner, steamCmdService);
            if (!useDirectSteamCmd.HasValue)
            {
                return false;
            }

            OperationResult result;
            if (useDirectSteamCmd.Value)
            {
                if (!SteamCmdUiHelper.EnsureSteamCmdAvailable(owner, steamCmdService))
                {
                    return false;
                }

                result = steamCmdService.UpdateWorkshopMods(confirmedIds);
            }
            else
            {
                result = steamCmdService.UpdateWorkshopModsViaTools(confirmedIds);
            }

            if (result.Success)
            {
                MessageBox.Show(owner, result.Message, "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return true;
            }

            MessageBox.Show(owner, result.Message, "失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }

        private static bool? AskUseDirectSteamCmd(IWin32Window owner, ISteamCmdService steamCmdService)
        {
            if (!steamCmdService.IsSteamCmdToolsAvailable())
            {
                return true;
            }

            DialogResult choice = MessageBox.Show(
                owner,
                "直接使用 steamcmd 下载吗？\n\n"
                + "是：启动 steamcmd 控制台（需输入 Steam Guard 验证码）\n"
                + "否：使用自带 steamcmdTools（带进度界面）",
                "选择下载工具",
                MessageBoxButtons.YesNoCancel,
                MessageBoxIcon.Question);

            if (choice == DialogResult.Cancel)
            {
                return null;
            }

            if (choice == DialogResult.Yes)
            {
                return true;
            }

            return false;
        }

        private static bool ConfirmOutsideWorkshopPaths(IWin32Window owner, IList<ScannedModRow> scannedRows, string workshopRoot)
        {
            if (scannedRows == null || string.IsNullOrEmpty(workshopRoot))
            {
                return true;
            }

            string workshopContent = System.IO.Path.Combine(workshopRoot, @"steamapps\workshop\content\107410");
            var builder = new StringBuilder();
            foreach (ScannedModRow row in scannedRows)
            {
                if (!row.UpdateSelected || row.ModId <= 0 || string.IsNullOrEmpty(row.ModPath))
                {
                    continue;
                }

                if (row.ModPath.IndexOf(workshopContent, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    continue;
                }

                builder.AppendLine("模组名: " + row.ModName);
                builder.AppendLine("模组路径: " + row.ModPath);
                builder.AppendLine();
            }

            if (builder.Length == 0)
            {
                return true;
            }

            DialogResult confirm = MessageBox.Show(
                owner,
                "以下模组不在 Workshop 根目录下，继续会在 SteamCMD 目录重新下载一份：\n\n" + builder,
                "注意",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);
            return confirm == DialogResult.Yes;
        }

        private static ModDownloadConfirmForm CreateConfirmDialog(
            IList<ulong> modIds,
            IList<LauncherHtmlModEntry> htmlEntries)
        {
            if (htmlEntries != null && htmlEntries.Count > 0)
            {
                return new ModDownloadConfirmForm(htmlEntries);
            }

            return new ModDownloadConfirmForm(modIds);
        }
    }
}
