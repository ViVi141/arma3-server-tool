using System;
using System.Collections.Generic;
using System.Text;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms
{
    internal static class ModEnableUiHelper
    {
        public static bool TryEnableModsFromHtml(
            IWin32Window owner,
            IList<LauncherHtmlModEntry> htmlEntries,
            ArmaServerConfig config,
            SteamcmdEntity settings,
            BikeyService bikeyService,
            Action refreshGrid)
        {
            if (config == null)
            {
                AntdUiHelper.ShowWarning(owner, "请先选择服务器配置。", "提示");
                return false;
            }

            if (settings == null || string.IsNullOrEmpty(settings.d))
            {
                AntdUiHelper.ShowWarning(owner, "请先在 SteamCMD 设置中配置 Workshop 根目录。", "提示");
                return false;
            }

            if (htmlEntries == null || htmlEntries.Count == 0)
            {
                AntdUiHelper.ShowWarning(owner, "HTML 中未解析到模组。", "读取失败");
                return false;
            }

            var enabler = new ModEnablerService();
            IList<LauncherHtmlModEntry> selectedEntries;
            ModApplyTarget target;
            using (var dialog = new HtmlModEnableForm(htmlEntries, settings.d, enabler))
            {
                Form ownerForm = owner as Form;
                if (dialog.ShowDialog(ownerForm) != DialogResult.OK)
                {
                    return false;
                }

                selectedEntries = dialog.GetSelectedEntries();
                target = dialog.GetApplyTarget();
            }

            if (selectedEntries.Count == 0)
            {
                AntdUiHelper.ShowInfo(owner, "请至少勾选一个要启用的模组。", "提示");
                return false;
            }

            ModEnableApplyResult applyResult = enabler.ApplyHtmlMods(config, settings.d, selectedEntries, target);
            if (applyResult.AppliedCount == 0)
            {
                AntdUiHelper.ShowWarning(
                    owner,
                    "没有模组被启用。请确认模组已下载到 Workshop 目录。",
                    "启用失败");
                return false;
            }

            foreach (ModsEntity entity in config.StartupParameters.modsEntities)
            {
                if (entity.LocalMod || entity.ServerMod || entity.HeadlessClientMod)
                {
                    bikeyService.CopyBikeysForMod(config, entity);
                }
            }

            if (refreshGrid != null)
            {
                refreshGrid();
            }

            var message = new StringBuilder();
            message.AppendLine("已启用 " + applyResult.AppliedCount + " 个模组。");
            message.AppendLine("应用范围: " + DescribeTarget(target));
            if (applyResult.MissingOnDisk.Count > 0)
            {
                message.AppendLine();
                message.AppendLine("以下模组未找到本地目录，已跳过:");
                foreach (LauncherHtmlModEntry missing in applyResult.MissingOnDisk)
                {
                    message.AppendLine("- " + missing.DisplayName + " (" + missing.ModId + ")");
                }
            }

            AntdUiHelper.ShowInfo(owner, message.ToString(), "启用完成");
            return true;
        }

        private static string DescribeTarget(ModApplyTarget target)
        {
            if (target == ModApplyTarget.Server)
            {
                return "服务器模组 (-serverMod)";
            }

            if (target == ModApplyTarget.Headless)
            {
                return "无头客户端 (HC -mod)";
            }

            if (target == ModApplyTarget.All)
            {
                return "全部 (客户端 + 服务端 + 无头)";
            }

            return "客户端模组 (-mod)";
        }
    }
}
