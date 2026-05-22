using System;
using System.Collections.Generic;
using System.Drawing;
using System.Text;
using System.Windows.Forms;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using AntButton = AntdUI.Button;
using AntLabel = AntdUI.Label;

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
                AntdUiHelper.ShowWarning(owner, "HTML 中未解析到 Workshop 模组 ID。", "读取失败");
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
                AntdUiHelper.ShowWarning(owner, "请先配置 SteamCMD 账号和 Workshop 根目录。", "提示");
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
                AntdUiHelper.ShowInfo(owner, result.Message, "成功");
                return true;
            }

            AntdUiHelper.ShowError(owner, result.Message, "失败");
            return false;
        }

        private static bool? AskUseDirectSteamCmd(IWin32Window owner, ISteamCmdService steamCmdService)
        {
            if (!steamCmdService.IsSteamCmdToolsAvailable())
            {
                return true;
            }

            Form ownerForm = owner as Form;
            using (var dialog = new SteamDownloadToolChoiceDialog())
            {
                if (dialog.ShowDialog(ownerForm) != DialogResult.OK)
                {
                    return null;
                }

                return dialog.UseDirectSteamCmd;
            }
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

            return AntdUiHelper.Confirm(owner, "注意", "以下模组不在 Workshop 根目录下，继续会在 SteamCMD 目录重新下载一份：\n\n" + builder);
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

        private sealed class SteamDownloadToolChoiceDialog : AntdDialogForm
        {
            internal bool UseDirectSteamCmd { get; private set; }

            internal SteamDownloadToolChoiceDialog()
                : base()
            {
                Text = "选择下载工具";
                ApplyPreferredDialogSizing(520, 240, null);

                AntLabel hint = AntdUiHelper.CreateHintLabel(
                    "直接使用 steamcmd 下载吗？" + Environment.NewLine + Environment.NewLine
                    + "是：启动 steamcmd 控制台（需输入 Steam Guard 验证码）" + Environment.NewLine
                    + "否：使用自带 steamcmdTools（带进度界面）",
                    480);
                hint.Dock = DockStyle.Top;

                AntButton yesButton = AntdUiHelper.CreatePrimaryButton("是");
                yesButton.Margin = new Padding(UiScaleHelper.Scale(8), 0, 0, 0);
                yesButton.Click += delegate
                {
                    UseDirectSteamCmd = true;
                    DialogResult = DialogResult.OK;
                    Close();
                };

                AntButton noButton = AntdUiHelper.CreateToolbarButton("否");
                noButton.Margin = new Padding(UiScaleHelper.Scale(8), 0, 0, 0);
                noButton.Click += delegate
                {
                    UseDirectSteamCmd = false;
                    DialogResult = DialogResult.OK;
                    Close();
                };

                AntButton cancelButton = AntdUiHelper.CreateToolbarButton("取消");
                cancelButton.Margin = new Padding(UiScaleHelper.Scale(8), 0, 0, 0);
                cancelButton.Click += delegate
                {
                    DialogResult = DialogResult.Cancel;
                    Close();
                };

                var buttonPanel = new FlowLayoutPanel
                {
                    Dock = DockStyle.Bottom,
                    FlowDirection = FlowDirection.RightToLeft,
                    AutoSize = true,
                    Padding = new Padding(
                        UiScaleHelper.Scale(12),
                        UiScaleHelper.Scale(4),
                        UiScaleHelper.Scale(12),
                        UiScaleHelper.Scale(8)),
                };
                buttonPanel.Controls.Add(cancelButton);
                buttonPanel.Controls.Add(noButton);
                buttonPanel.Controls.Add(yesButton);

                var filler = new AntdUI.Panel
                {
                    Dock = DockStyle.Fill,
                    Padding = AppTheme.ContentPadding,
                };
                filler.Controls.Add(hint);

                Controls.Add(buttonPanel);
                Controls.Add(filler);
            }
        }
    }
}
