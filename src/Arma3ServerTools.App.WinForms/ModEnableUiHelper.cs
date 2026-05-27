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
            Action refreshGrid,
            ISteamCmdService steamCmdService = null,
            IAppPaths appPaths = null,
            ModWorkshopWorkflowService modWorkshopWorkflow = null)
        {
            if (config == null)
            {
                AntdUiHelper.ShowWarning(owner, "请先选择服务器配置。", "提示");
                return false;
            }

            if (settings == null || string.IsNullOrEmpty(settings.d))
            {
                AntdUiHelper.ShowWarning(
                    owner,
                    "请先在 SteamCMD 设置中配置 SteamCMD 程序目录，或点「下载 SteamCMD」使用工具内置目录。",
                    "提示");
                return false;
            }

            if (htmlEntries == null || htmlEntries.Count == 0)
            {
                AntdUiHelper.ShowWarning(owner, "HTML 中未解析到模组。", "读取失败");
                return false;
            }

            IList<LauncherHtmlModEntry> selectedEntries;
            ModApplyTarget target;
            using (var dialog = new HtmlModEnableForm(
                htmlEntries,
                settings.d,
                new ModEnablerService(),
                steamCmdService,
                appPaths,
                settings))
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

            OperationResult applyResult;
            if (modWorkshopWorkflow != null && target == ModApplyTarget.Server)
            {
                applyResult = modWorkshopWorkflow.EnableHtmlModsOnServer(config, selectedEntries);
            }
            else
            {
                var enabler = new ModEnablerService();
                ModEnableApplyResult legacy = enabler.ApplyHtmlMods(config, settings.d, selectedEntries, target);
                applyResult = legacy.AppliedCount == 0
                    ? OperationResult.Fail("没有模组被启用。")
                    : OperationResult.Ok("已启用 " + legacy.AppliedCount + " 个模组。");
            }

            if (!applyResult.Success)
            {
                AntdUiHelper.ShowWarning(owner, applyResult.Message, "启用失败");
                return false;
            }

            if (refreshGrid != null)
            {
                refreshGrid();
            }

            AntdUiHelper.ShowInfo(owner, applyResult.Message + Environment.NewLine + "应用范围: " + DescribeTarget(target), "启用完成");
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
