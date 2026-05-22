using System;
using System.IO;
using System.Windows.Forms;
using AntButton = AntdUI.Button;
using AntCheckbox = AntdUI.Checkbox;
using AntInput = AntdUI.Input;
using AntInputNumber = AntdUI.InputNumber;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Validation;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class QuickSetupWizardForm : AntdDialogForm
    {
        private readonly IAppServices appServices;
        private readonly AntInput nameInput;
        private readonly AntInput dirInput;
        private readonly AntInput hostNameInput;
        private readonly AntInputNumber portInput;
        private readonly AntInputNumber maxPlayersInput;
        private readonly AntCheckbox battlEyeCheckBox;
        private readonly AntInput rconPasswordInput;
        private readonly AntInputNumber rconPortInput;
        private readonly AntCheckbox writeCfgCheckBox;

        public QuickSetupWizardForm(IAppServices appServices)
            : base()
        {
            this.appServices = appServices;
            Text = "快速配置向导";
            ApplyPreferredDialogSizing(560, 520, null);

            var layout = SettingsLayoutHelper.CreateFormLayout(120);
            nameInput = SettingsLayoutHelper.AddRow(layout, "配置名称", SettingsLayoutHelper.CreateInput(true));
            nameInput.Text = "我的服务器";

            AntButton browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            browseButton.Click += OnBrowseDirectory;
            var dirPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            dirInput = SettingsLayoutHelper.CreateInput(false);
            dirInput.Width = UiScaleHelper.Scale(380);
            dirPanel.Controls.Add(dirInput);
            dirPanel.Controls.Add(browseButton);
            SettingsLayoutHelper.AddRow(layout, "服务器目录", dirPanel);

            hostNameInput = SettingsLayoutHelper.AddRow(layout, "主机名", SettingsLayoutHelper.CreateInput(true));
            hostNameInput.Text = "Arma 3 Server";
            portInput = SettingsLayoutHelper.AddRow(
                layout,
                "游戏端口",
                SettingsLayoutHelper.CreateNumeric(1, 65535, 2302, 120));
            maxPlayersInput = SettingsLayoutHelper.AddRow(
                layout,
                "最大玩家",
                SettingsLayoutHelper.CreateNumeric(1, 200, 64, 120));

            battlEyeCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "BattlEye",
                SettingsLayoutHelper.CreateCheckbox("启用 BattlEye 反作弊", true));
            rconPasswordInput = SettingsLayoutHelper.AddRow(
                layout,
                "RCon 密码",
                SettingsLayoutHelper.CreatePasswordInput());
            rconPortInput = SettingsLayoutHelper.AddRow(
                layout,
                "RCon 端口",
                SettingsLayoutHelper.CreateNumeric(1024, 65535, 2310, 120));

            writeCfgCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "完成后",
                SettingsLayoutHelper.CreateCheckbox("保存到工具并应用到服务器目录", true));

            AntLabel hint = AntdUiHelper.CreateHintLabel(
                UiLabels.PathRulesHint + " 向导将创建新的服务器配置；专用服务器需已安装到所选目录。",
                500);
            hint.Dock = DockStyle.Top;

            AntButton finishButton = AntdUiHelper.CreatePrimaryButton("完成");
            finishButton.Click += OnFinish;
            AntButton cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            cancelButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            var filler = new AntPanel { Dock = DockStyle.Fill, Padding = AppTheme.ContentPadding };
            filler.Controls.Add(SettingsLayoutHelper.CreateScrollHost(layout));

            Controls.Add(CreateButtonBar(finishButton, cancelButton, "完成", "取消"));
            Controls.Add(filler);
            Controls.Add(hint);
        }

        public ArmaServerConfig CreatedConfig { get; private set; }

        public bool AppliedConfigToServer { get; private set; }

        private void OnFinish(object sender, EventArgs e)
        {
            string name = nameInput.Text.Trim();
            string dir = dirInput.Text.Trim();
            if (string.IsNullOrEmpty(name))
            {
                AntdUiHelper.ShowWarning(this, "请输入配置名称。", "提示");
                return;
            }

            if (string.IsNullOrEmpty(dir))
            {
                AntdUiHelper.ShowWarning(this, "请选择服务器目录。", "提示");
                return;
            }

            if (PathValidation.ContainsChinese(dir) || PathValidation.ContainsChinese(AppContext.BaseDirectory))
            {
                AntdUiHelper.ShowWarning(this, UiLabels.PathRulesShort, "提示");
                return;
            }

            if (string.IsNullOrWhiteSpace(hostNameInput.Text))
            {
                AntdUiHelper.ShowWarning(this, "请输入主机名。", "提示");
                return;
            }

            try
            {
                ArmaServerConfig config = appServices.ConfigService.Create(name, dir);
                config.ServerConfig.HostName = hostNameInput.Text.Trim();
                config.StartupParameters.Port = (int)portInput.Value;
                config.ServerConfig.MaxPlayers = (int)maxPlayersInput.Value;
                config.ServerConfig.BattlEye = battlEyeCheckBox.Checked;
                config.BattlEyeConfig.RConPassword = rconPasswordInput.Text;
                config.BattlEyeConfig.RConPort = (int)rconPortInput.Value;
                config.BattlEyeConfig.RConHost = "127.0.0.1";

                appServices.ConfigService.Save(config);
                AppliedConfigToServer = false;

                if (writeCfgCheckBox.Checked)
                {
                    OperationResult writeResult = appServices.ConfigWriter.WriteAll(config);
                    if (!writeResult.Success)
                    {
                        AntdUiHelper.ShowError(this, writeResult.Message, "应用到服务器目录失败");
                        return;
                    }

                    AppliedConfigToServer = true;
                }

                CreatedConfig = config;
                DialogResult = DialogResult.OK;
                Close();
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(this, ex.Message, "创建失败");
            }
        }

        private void OnBrowseDirectory(object sender, EventArgs e)
        {
            using (var dialog = new FolderBrowserDialog())
            {
                if (dialog.ShowDialog(this) == DialogResult.OK)
                {
                    dirInput.Text = dialog.SelectedPath;
                }
            }
        }
    }
}
