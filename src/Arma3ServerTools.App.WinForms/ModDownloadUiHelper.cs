using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms
{
    internal static class ModDownloadUiHelper
    {
        public static async Task<bool> TryDownloadModsAsync(
            IWin32Window owner,
            IList<ulong> modIds,
            IList<ScannedModRow> scannedRows,
            SteamcmdEntity settings,
            ISteamCmdService steamCmdService,
            IAppPaths paths)
        {
            return await TryDownloadModsInternalAsync(
                owner,
                modIds,
                scannedRows,
                settings,
                steamCmdService,
                paths,
                null).ConfigureAwait(true);
        }

        public static async Task<bool> TryDownloadModsFromHtmlAsync(
            IWin32Window owner,
            IList<LauncherHtmlModEntry> htmlEntries,
            SteamcmdEntity settings,
            ISteamCmdService steamCmdService,
            IAppPaths paths)
        {
            if (htmlEntries == null || htmlEntries.Count == 0)
            {
                AntdUiHelper.ShowWarning(owner, "HTML 中未解析到 Workshop 模组 ID。", "读取失败");
                return false;
            }

            var modIds = new List<ulong>();
            foreach (LauncherHtmlModEntry entry in htmlEntries)
            {
                modIds.Add(entry.ModId);
            }

            return await TryDownloadModsInternalAsync(
                owner,
                modIds,
                null,
                settings,
                steamCmdService,
                paths,
                htmlEntries).ConfigureAwait(true);
        }

        private static async Task<bool> TryDownloadModsInternalAsync(
            IWin32Window owner,
            IList<ulong> modIds,
            IList<ScannedModRow> scannedRows,
            SteamcmdEntity settings,
            ISteamCmdService steamCmdService,
            IAppPaths paths,
            IList<LauncherHtmlModEntry> htmlEntries)
        {
            if (settings == null || string.IsNullOrEmpty(settings.u) || string.IsNullOrEmpty(settings.d))
            {
                AntdUiHelper.ShowWarning(
                    owner,
                    "请先配置 SteamCMD 账号；程序目录可留空（使用工具内置）或填写含 steamcmd.exe 的文件夹。",
                    "提示");
                return false;
            }

            if (modIds == null || modIds.Count == 0)
            {
                AntdUiHelper.ShowInfo(owner, "没有可下载的 Workshop 模组 ID。", "提示");
                return false;
            }

            if (!ConfirmOutsideWorkshopPaths(owner, scannedRows, settings.d))
            {
                return false;
            }

            IList<ulong> confirmedIds;
            using (ModDownloadConfirmForm confirmDialog = CreateConfirmDialog(modIds, htmlEntries))
            {
                Form ownerForm = owner as Form;
                if (confirmDialog.ShowDialog(ownerForm) != DialogResult.OK)
                {
                    return false;
                }

                confirmedIds = confirmDialog.GetSelectedModIds();
            }

            if (confirmedIds.Count == 0)
            {
                AntdUiHelper.ShowInfo(owner, "请至少选择一个模组。", "提示");
                return false;
            }

            return await SteamCmdUiHelper.TryDownloadWorkshopModsAsync(
                owner,
                steamCmdService,
                paths,
                confirmedIds).ConfigureAwait(true);
        }

        private static bool ConfirmOutsideWorkshopPaths(IWin32Window owner, IList<ScannedModRow> scannedRows, string workshopRoot)
        {
            if (scannedRows == null || string.IsNullOrEmpty(workshopRoot))
            {
                return true;
            }

            string workshopContent = Path.Combine(workshopRoot, ModEnablerService.WorkshopContentRelativePath);
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

            return AntdUiHelper.Confirm(
                owner,
                "注意",
                "以下模组不在模组下载目录（steamapps\\workshop\\content\\107410）下，"
                + "继续会在 SteamCMD 程序目录重新下载一份：\n\n" + builder);
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
