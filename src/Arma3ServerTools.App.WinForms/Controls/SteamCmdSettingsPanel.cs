using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Validation;
using AntButton = AntdUI.Button;
using AntInput = AntdUI.Input;
using AntLabel = AntdUI.Label;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class SteamCmdSettingsPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntInput userInput;
        private readonly AntInput passwordInput;
        private readonly AntInput workshopRootInput;
        private readonly AntInput serverInstallInput;
        private readonly AntLabel workshopContentLabel;
        private readonly AntLabel steamCmdStatusLabel;
        private readonly AntLabel currentServerDirLabel;
        private readonly AntButton downloadButton;
        private readonly AntButton installServerButton;

        private readonly IAppServices appServices;
        private ArmaServerConfig boundConfig;
        private SteamcmdEntity draftSettings = new SteamcmdEntity();

        public SteamCmdSettingsPanel(IAppServices appServices)
        {
            this.appServices = appServices;
            AppTheme.ApplyTo(this);
            Dock = DockStyle.Fill;

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(4)),
            };
            downloadButton = SettingsLayoutHelper.CreateButton("下载 SteamCMD");
            installServerButton = SettingsLayoutHelper.CreateButton("安装/更新专用服务器");
            downloadButton.Click += OnDownloadSteamCmd;
            installServerButton.Click += OnInstallDedicatedServer;
            toolbar.Controls.Add(downloadButton);
            toolbar.Controls.Add(installServerButton);

            var root = SettingsLayoutHelper.CreateSectionsStack();
            SettingsLayoutHelper.AddStackSection(
                root,
                SettingsLayoutHelper.CreateGroup("Steam 账号", BuildAccountSection(out userInput, out passwordInput)));
            SettingsLayoutHelper.AddStackSection(
                root,
                SettingsLayoutHelper.CreateGroup("路径", BuildPathSection(
                    out workshopRootInput,
                    out serverInstallInput,
                    out workshopContentLabel,
                    out steamCmdStatusLabel)));
            SettingsLayoutHelper.AddStackSection(
                root,
                SettingsLayoutHelper.CreateGroup("当前服务器", BuildCurrentServerSection(out currentServerDirLabel)));

            AntLabel hint = AntdUiHelper.CreateHintLabel(
                UiLabels.PathRulesHint
                    + " Workshop 根目录通常为 SteamCMD 解压目录（含 steamcmd.exe）。"
                    + "模组实际位于 steamapps\\workshop\\content\\107410。"
                    + "保存到工具时会同步写入 Steam 设置并更新模组扫描路径。",
                640);
            hint.Dock = DockStyle.Top;

            Controls.Add(SettingsLayoutHelper.CreateScrollHost(root));
            Controls.Add(toolbar);
            Controls.Add(hint);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            draftSettings = appServices.GetSteamCmdSettings() ?? new SteamcmdEntity();
            if (draftSettings == null)
            {
                draftSettings = new SteamcmdEntity();
            }

            userInput.Text = draftSettings.u ?? string.Empty;
            passwordInput.Text = draftSettings.p ?? string.Empty;
            workshopRootInput.Text = draftSettings.d ?? string.Empty;
            serverInstallInput.Text = draftSettings.i ?? string.Empty;

            RefreshDerivedLabels();
            RefreshCurrentServerHint();
        }

        public void ApplyToModel()
        {
            SteamcmdEntity next = ReadDraftFromUi();
            if (IsSameSteamSettings(next, draftSettings))
            {
                return;
            }

            draftSettings = next;
            appServices.SaveSteamCmdSettings(draftSettings);
            appServices.ModScannerService.EnsureDefaultWorkshopPath(draftSettings);
            RefreshDerivedLabels();
        }

        private SteamcmdEntity ReadDraftFromUi()
        {
            return new SteamcmdEntity
            {
                u = userInput.Text.Trim(),
                p = passwordInput.Text,
                d = workshopRootInput.Text.Trim(),
                i = serverInstallInput.Text.Trim(),
            };
        }

        private static bool IsSameSteamSettings(SteamcmdEntity left, SteamcmdEntity right)
        {
            if (left == null && right == null)
            {
                return true;
            }

            if (left == null || right == null)
            {
                return false;
            }

            return string.Equals(left.u, right.u, StringComparison.Ordinal)
                && string.Equals(left.p, right.p, StringComparison.Ordinal)
                && string.Equals(left.d, right.d, StringComparison.OrdinalIgnoreCase)
                && string.Equals(left.i, right.i, StringComparison.OrdinalIgnoreCase);
        }

        private Control BuildAccountSection(out AntInput userBox, out AntInput passwordBox)
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            userBox = SettingsLayoutHelper.AddRow(layout, "Steam 账号", SettingsLayoutHelper.CreateInput(true));
            Control steamPwdContainer = SettingsLayoutHelper.CreatePasswordInputWithToggle(out AntInput steamPwdInput);
            passwordBox = steamPwdInput;
            SettingsLayoutHelper.AddRow(layout, "Steam 密码", steamPwdContainer);
            return layout;
        }

        private Control BuildPathSection(
            out AntInput workshopRootBox,
            out AntInput serverInstallBox,
            out AntLabel workshopContentValue,
            out AntLabel steamCmdStatusValue)
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            workshopRootBox = AddBrowseRow(layout, "Workshop 根目录", OnBrowseWorkshopRoot);
            serverInstallBox = AddBrowseRow(layout, "专用服务器目录", OnBrowseServerInstall);

            workshopContentValue = new AntLabel
            {
                AutoSizeMode = AntdUI.TAutoSize.None,
                Height = UiScaleHelper.Scale(40),
                ForeColor = Color.Gray,
            };
            SettingsLayoutHelper.AddRow(layout, "Workshop 模组路径", workshopContentValue, 48);

            steamCmdStatusValue = new AntLabel
            {
                AutoSizeMode = AntdUI.TAutoSize.None,
                Height = UiScaleHelper.Scale(56),
                ForeColor = Color.Gray,
            };
            SettingsLayoutHelper.AddRow(layout, "SteamCMD 状态", steamCmdStatusValue, 64);
            return layout;
        }

        private static Control BuildCurrentServerSection(out AntLabel serverDirValue)
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            serverDirValue = new AntLabel
            {
                AutoSizeMode = AntdUI.TAutoSize.None,
                Height = UiScaleHelper.Scale(40),
                ForeColor = Color.Gray,
            };
            SettingsLayoutHelper.AddRow(layout, "本配置服务器目录", serverDirValue, 48);
            return layout;
        }

        private AntInput AddBrowseRow(TableLayoutPanel layout, string label, EventHandler onBrowseClick)
        {
            var panel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            var textInput = SettingsLayoutHelper.CreateInput(false);
            textInput.Width = UiScaleHelper.Scale(420);
            textInput.TextChanged += OnPathInputChanged;

            AntButton browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            browseButton.Click += onBrowseClick;

            panel.Controls.Add(textInput);
            panel.Controls.Add(browseButton);
            SettingsLayoutHelper.AddRow(layout, label, panel);
            return textInput;
        }

        private void OnPathInputChanged(object sender, EventArgs e)
        {
            RefreshDerivedLabels();
        }

        private void RefreshDerivedLabels()
        {
            string workshopRoot = workshopRootInput.Text.Trim();
            string workshopContent = GetWorkshopContentPath(workshopRoot);
            if (string.IsNullOrEmpty(workshopContent))
            {
                workshopContentLabel.Text = "（请先填写 Workshop 根目录）";
            }
            else if (Directory.Exists(workshopContent))
            {
                workshopContentLabel.Text = workshopContent + Environment.NewLine + "（目录已存在，保存后会加入模组扫描路径）";
            }
            else
            {
                workshopContentLabel.Text = workshopContent + Environment.NewLine + "（目录尚未创建，保存后会尝试创建）";
            }

            IAppPaths paths = appServices.Paths;
            string bundledPath = SteamCmdBootstrapper.GetBundledExecutablePath(paths);
            bool bundledExists = SteamCmdBootstrapper.IsInstallationComplete(
                SteamCmdBootstrapper.GetBundledDirectory(paths));
            string customPath = string.Empty;
            bool customExists = false;
            if (!string.IsNullOrEmpty(workshopRoot))
            {
                customPath = Path.Combine(workshopRoot, "steamcmd.exe");
                customExists = File.Exists(customPath);
            }

            var status = new System.Text.StringBuilder();
            status.AppendLine("内置目录: " + bundledPath);
            if (bundledExists)
            {
                status.AppendLine("  → 已安装");
            }
            else
            {
                status.AppendLine("  → 未找到，可点击「下载 SteamCMD」");
            }

            if (!string.IsNullOrEmpty(customPath))
            {
                status.AppendLine("Workshop 根目录: " + customPath);
                if (customExists)
                {
                    status.AppendLine("  → 已安装");
                }
                else
                {
                    status.AppendLine("  → 未找到 steamcmd.exe");
                }
            }

            steamCmdStatusLabel.Text = status.ToString().TrimEnd();
        }

        private void RefreshCurrentServerHint()
        {
            if (boundConfig == null || string.IsNullOrWhiteSpace(boundConfig.ServerDir))
            {
                currentServerDirLabel.Text = "（未选择服务器或未设置目录）";
                return;
            }

            currentServerDirLabel.Text = boundConfig.ServerDir + Environment.NewLine
                + "安装/更新专用服务器时优先使用此目录。";
        }

        private void OnBrowseWorkshopRoot(object sender, EventArgs e)
        {
            BrowseDirectory(workshopRootInput);
        }

        private void OnBrowseServerInstall(object sender, EventArgs e)
        {
            BrowseDirectory(serverInstallInput);
        }

        private void BrowseDirectory(AntInput target)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                if (!string.IsNullOrEmpty(target.Text))
                {
                    dialog.SelectedPath = target.Text;
                }

                if (dialog.ShowDialog(FindForm()) == DialogResult.OK)
                {
                    target.Text = dialog.SelectedPath;
                    RefreshDerivedLabels();
                }
            }
        }

        private async void OnDownloadSteamCmd(object sender, EventArgs e)
        {
            downloadButton.Enabled = false;
            installServerButton.Enabled = false;
            try
            {
                OperationResult result = await SteamCmdUiHelper.DownloadSteamCmdAsync(
                    FindForm(),
                    appServices.SteamCmdService,
                    appServices.Paths).ConfigureAwait(true);
                if (result.Success)
                {
                    AntdUiHelper.ShowInfo(FindForm(), result.Message, "SteamCMD 已就绪");
                }
                else
                {
                    AntdUiHelper.ShowError(FindForm(), result.Message, "下载失败");
                }
            }
            finally
            {
                downloadButton.Enabled = true;
                installServerButton.Enabled = true;
                RefreshDerivedLabels();
            }
        }

        private async void OnInstallDedicatedServer(object sender, EventArgs e)
        {
            OperationResult validation = ValidateDraftSettings();
            if (!validation.Success)
            {
                AntdUiHelper.ShowError(FindForm(), validation.Message, "无法安装");
                return;
            }

            string installDir = ResolveInstallDirectory();
            if (string.IsNullOrEmpty(installDir))
            {
                AntdUiHelper.ShowWarning(
                    FindForm(),
                    "请填写专用服务器目录，或在「基本」页设置当前配置的服务器目录。",
                    "提示");
                return;
            }

            downloadButton.Enabled = false;
            installServerButton.Enabled = false;
            try
            {
                if (!await SteamCmdUiHelper.EnsureSteamCmdAvailableAsync(
                    FindForm(),
                    appServices.SteamCmdService,
                    appServices.Paths).ConfigureAwait(true))
                {
                    return;
                }

                draftSettings = ReadDraftFromUi();
                await Task.Run(() =>
                {
                    appServices.SaveSteamCmdSettings(draftSettings);
                }).ConfigureAwait(true);

                OperationResult result = await Task.Run(() =>
                    appServices.SteamCmdService.InstallDedicatedServer(installDir)).ConfigureAwait(true);
                if (result.Success)
                {
                    AntdUiHelper.ShowInfo(FindForm(), result.Message, "成功");
                }
                else
                {
                    AntdUiHelper.ShowError(FindForm(), result.Message, "失败");
                }
            }
            finally
            {
                downloadButton.Enabled = true;
                installServerButton.Enabled = true;
            }
        }

        private string ResolveInstallDirectory()
        {
            if (boundConfig != null && !string.IsNullOrWhiteSpace(boundConfig.ServerDir))
            {
                return boundConfig.ServerDir.Trim();
            }

            return serverInstallInput.Text.Trim();
        }

        private OperationResult ValidateDraftSettings()
        {
            if (PathValidation.ContainsChinese(userInput.Text)
                || PathValidation.ContainsChinese(passwordInput.Text)
                || PathValidation.ContainsChinese(workshopRootInput.Text)
                || PathValidation.ContainsChinese(serverInstallInput.Text))
            {
                return OperationResult.Fail("SteamCMD 相关路径和账号不能包含中文。");
            }

            return OperationResult.Ok();
        }

        private static string GetWorkshopContentPath(string workshopRoot)
        {
            if (string.IsNullOrEmpty(workshopRoot))
            {
                return string.Empty;
            }

            return Path.Combine(workshopRoot, @"steamapps\workshop\content\107410");
        }
    }
}
