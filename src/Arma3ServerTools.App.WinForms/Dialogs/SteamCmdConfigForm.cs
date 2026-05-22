using System;
using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Validation;
using AntButton = AntdUI.Button;
using AntInput = AntdUI.Input;
namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class SteamCmdConfigForm : AntdDialogForm
    {
        private readonly AntInput userInput;
        private readonly AntInput passwordInput;
        private readonly AntInput workshopRootInput;
        private readonly AntInput serverInstallInput;

        public SteamCmdConfigForm(SteamcmdEntity current)
            : base()
        {
            Text = "SteamCMD 配置";
            ApplyPreferredDialogSizing(520, 240, null);

            var layout = SettingsLayoutHelper.CreateFormLayout(120);

            userInput = SettingsLayoutHelper.AddRow(layout, "Steam 账号", SettingsLayoutHelper.CreateInput(true));
            passwordInput = SettingsLayoutHelper.AddRow(layout, "Steam 密码", SettingsLayoutHelper.CreatePasswordInput());
            workshopRootInput = AddBrowseRow(layout, "Workshop 根目录", BrowseWorkshop_Click);
            serverInstallInput = AddBrowseRow(layout, "专用服务器目录", BrowseServer_Click);

            if (current != null)
            {
                userInput.Text = current.u ?? string.Empty;
                passwordInput.Text = current.p ?? string.Empty;
                workshopRootInput.Text = current.d ?? string.Empty;
                serverInstallInput.Text = current.i ?? string.Empty;
            }

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
            Control buttonBar = CreateButtonBar(okButton, cancelButton, "保存", "取消");

            var body = SettingsLayoutHelper.CreateScrollHost(layout);
            Controls.Add(body);
            Controls.Add(buttonBar);
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
                }
            }
        }

        private AntInput AddBrowseRow(TableLayoutPanel layout, string label, EventHandler onBrowseClick)
        {
            var panel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            var textInput = SettingsLayoutHelper.CreateInput(false);
            textInput.Width = UiScaleHelper.Scale(320);

            AntButton browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            browseButton.Click += onBrowseClick;

            panel.Controls.Add(textInput);
            panel.Controls.Add(browseButton);
            SettingsLayoutHelper.AddRow(layout, label, panel);
            return textInput;
        }
    }
}
