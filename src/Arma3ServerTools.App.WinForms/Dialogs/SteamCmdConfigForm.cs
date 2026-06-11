using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Validation;
using AntButton = AntdUI.Button;
using AntInput = AntdUI.Input;
using AntLabel = AntdUI.Label;
namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class SteamCmdConfigForm : AntdDialogForm
    {
        private readonly IAppServices appServices;
        private readonly AntInput userInput;
        private readonly AntInput passwordInput;
        private readonly AntInput workshopRootInput;
        private readonly AntInput serverInstallInput;
        private readonly AntdUI.Label steamCmdStatusLabel;
        public SteamCmdConfigForm(IAppServices appServices, SteamcmdEntity current, Form ownerForm = null)
            : base()
        {
            this.appServices = appServices;
            Text = "SteamCMD 配置";
            ApplyPreferredDialogSizing(560, 500, 420, ownerForm);

            var layout = SettingsLayoutHelper.CreateFormLayout(120);

            AntLabel hint = AntdUiHelper.CreateHintLabel(
                UiLabels.PathRulesHint + " " + SteamPathUiHelper.PathsHint,
                540);
            SettingsLayoutHelper.AddRow(layout, string.Empty, hint, 96);

            userInput = SettingsLayoutHelper.AddRow(layout, "Steam 账号", SettingsLayoutHelper.CreateInput(true));
            passwordInput = SettingsLayoutHelper.AddRow(layout, "Steam 密码", SettingsLayoutHelper.CreatePasswordInput());
            workshopRootInput = AddBrowseRow(
                layout,
                SteamPathUiHelper.ProgramDirectoryLabel,
                BrowseWorkshop_Click);
            serverInstallInput = AddBrowseRow(
                layout,
                SteamPathUiHelper.DedicatedServerDirectoryLabel,
                BrowseServer_Click);

            steamCmdStatusLabel = new AntdUI.Label
            {
                AutoSizeMode = AntdUI.TAutoSize.None,
                Height = UiScaleHelper.Scale(72),
                ForeColor = Color.Gray,
            };
            SettingsLayoutHelper.AddRow(layout, SteamPathUiHelper.SteamCmdStatusLabel, steamCmdStatusLabel, 80);

            if (current != null)
            {
                userInput.Text = current.u ?? string.Empty;
                passwordInput.Text = current.p ?? string.Empty;
                workshopRootInput.Text = current.d ?? string.Empty;
                serverInstallInput.Text = current.i ?? string.Empty;
            }

            RefreshSteamCmdStatus();

            AntButton downloadButton = SettingsLayoutHelper.CreateButton("下载 SteamCMD");
            downloadButton.Click += OnDownloadSteamCmd;

            var okButton = SettingsLayoutHelper.CreateButton("保存");
            okButton.Type = AntdUI.TTypeMini.Primary;
            okButton.Click += delegate
            {
                DialogResult = DialogResult.OK;
                Close();
            };
            var cancelButton = SettingsLayoutHelper.CreateButton("取消");
            cancelButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            var bottomBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.LeftToRight,
                AutoSize = true,
                WrapContents = true,
                Padding = UiScaleHelper.ScalePadding(12, 4, 12, 8),
            };
            bottomBar.Controls.Add(downloadButton);
            bottomBar.Controls.Add(okButton);
            bottomBar.Controls.Add(cancelButton);
            okButton.Margin = new Padding(UiScaleHelper.Scale(12), 0, 0, 0);

            Controls.Add(bottomBar);
            Controls.Add(SettingsLayoutHelper.CreateScrollHost(layout));
        }

        public SteamcmdEntity BuildSettings()
        {
            return new SteamcmdEntity
            {
                u = userInput.Text.Trim(),
                p = passwordInput.Text,
                d = workshopRootInput.Text.Trim(),
                i = serverInstallInput.Text.Trim(),
            };
        }

        public OperationResult ValidateSettings()
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

        private void BrowseWorkshop_Click(object sender, EventArgs e)
        {
            BrowseDirectory(workshopRootInput);
        }

        private void BrowseServer_Click(object sender, EventArgs e)
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

                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    target.Text = dialog.SelectedPath;
                    RefreshSteamCmdStatus();
                }
            }
        }

        private async void OnDownloadSteamCmd(object sender, EventArgs e)
        {
            OperationResult result = await SteamCmdUiHelper.DownloadSteamCmdAsync(
                this,
                appServices.SteamCmdService,
                appServices.Paths).ConfigureAwait(true);
            if (result.Success)
            {
                AntdUiHelper.ShowInfo(this, result.Message, "SteamCMD 已就绪");
            }
            else
            {
                AntdUiHelper.ShowError(this, result.Message, "下载失败");
            }

            RefreshSteamCmdStatus();
        }

        private void RefreshSteamCmdStatus()
        {
            steamCmdStatusLabel.Text = SteamPathUiHelper.FormatSteamCmdLocationStatus(
                appServices.Paths,
                workshopRootInput.Text);
        }

        private AntInput AddBrowseRow(TableLayoutPanel layout, string label, EventHandler onBrowseClick)
        {
            var panel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            var textInput = SettingsLayoutHelper.CreateInput(false);
            textInput.Width = UiScaleHelper.Scale(320);
            textInput.TextChanged += delegate { RefreshSteamCmdStatus(); };

            AntButton browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            browseButton.Click += onBrowseClick;

            panel.Controls.Add(textInput);
            panel.Controls.Add(browseButton);
            SettingsLayoutHelper.AddRow(layout, label, panel);
            return textInput;
        }
    }
}
