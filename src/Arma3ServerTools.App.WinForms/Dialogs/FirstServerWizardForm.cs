using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Validation;
using AntButton = AntdUI.Button;
using AntCheckbox = AntdUI.Checkbox;
using AntInput = AntdUI.Input;
using AntInputNumber = AntdUI.InputNumber;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class FirstServerWizardForm : AntdDialogForm
    {
        private const int StepPrepare = 0;
        private const int StepConfigure = 1;

        private readonly AntLabel stepTitleLabel;
        private readonly AntPanel stepHost;
        private readonly AntPanel prepareStepPanel;
        private readonly AntPanel configureStepPanel;

        private readonly AntInput steamUserInput;
        private readonly AntInput steamPasswordInput;
        private readonly AntInput installDirInput;
        private readonly AntCheckbox installDedicatedCheckBox;

        private readonly AntInput nameInput;
        private readonly AntInput dirInput;
        private readonly AntInput hostNameInput;
        private readonly AntInputNumber portInput;
        private readonly AntInputNumber maxPlayersInput;
        private readonly AntCheckbox battlEyeCheckBox;
        private readonly AntInput rconPasswordInput;
        private readonly AntInputNumber rconPortInput;
        private readonly AntCheckbox writeCfgCheckBox;

        private readonly AntButton backButton;
        private readonly AntButton nextButton;
        private readonly AntButton skipButton;
        private readonly AntButton cancelButton;

        private readonly IAppServices appServices;
        private int currentStep = StepPrepare;
        private bool isBusy;

        public FirstServerWizardForm(IAppServices appServices)
            : base()
        {
            this.appServices = appServices;
            Text = "首服向导";
            ApplyPreferredDialogSizing(600, 620, null);

            stepTitleLabel = new AntLabel
            {
                Dock = DockStyle.Top,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = AppTheme.ContentPadding,
                Font = new System.Drawing.Font(Font.FontFamily, Font.Size + 1, System.Drawing.FontStyle.Bold),
                Text = "步骤 1/2 · 环境准备",
            };

            stepHost = new AntPanel
            {
                Dock = DockStyle.Fill,
                Padding = AppTheme.ContentPadding,
            };

            prepareStepPanel = BuildPrepareStep(
                out steamUserInput,
                out steamPasswordInput,
                out installDirInput,
                out installDedicatedCheckBox);
            configureStepPanel = BuildConfigureStep(
                out nameInput,
                out dirInput,
                out hostNameInput,
                out portInput,
                out maxPlayersInput,
                out battlEyeCheckBox,
                out rconPasswordInput,
                out rconPortInput,
                out writeCfgCheckBox);

            stepHost.Controls.Add(configureStepPanel);
            stepHost.Controls.Add(prepareStepPanel);

            backButton = AntdUiHelper.CreateToolbarButton("上一步");
            nextButton = AntdUiHelper.CreatePrimaryButton("下一步");
            skipButton = AntdUiHelper.CreateToolbarButton("跳过此步");
            cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            backButton.Click += OnBack;
            nextButton.Click += OnNext;
            skipButton.Click += OnSkip;
            cancelButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            var buttonBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.RightToLeft,
                AutoSize = true,
                Padding = UiScaleHelper.ScalePadding(12, 4, 12, 8),
            };
            buttonBar.Controls.Add(cancelButton);
            buttonBar.Controls.Add(skipButton);
            buttonBar.Controls.Add(backButton);
            buttonBar.Controls.Add(nextButton);

            Controls.Add(buttonBar);
            Controls.Add(stepHost);
            Controls.Add(stepTitleLabel);

            ShowStep(StepPrepare);
            LoadExistingSteamSettings();
        }

        public ArmaServerConfig CreatedConfig { get; private set; }

        public bool AppliedConfigToServer { get; private set; }

        private void LoadExistingSteamSettings()
        {
            SteamcmdEntity existing = appServices.GetSteamCmdSettings();
            if (existing == null)
            {
                return;
            }

            if (!string.IsNullOrEmpty(existing.u))
            {
                steamUserInput.Text = existing.u;
            }

            if (!string.IsNullOrEmpty(existing.p))
            {
                steamPasswordInput.Text = existing.p;
            }

            if (!string.IsNullOrEmpty(existing.i))
            {
                installDirInput.Text = existing.i;
            }
        }

        private AntPanel BuildPrepareStep(
            out AntInput steamUser,
            out AntInput steamPassword,
            out AntInput installDir,
            out AntCheckbox installDedicated)
        {
            var panel = new AntPanel { Dock = DockStyle.Fill };
            var layout = SettingsLayoutHelper.CreateFormLayout(128);

            steamUser = SettingsLayoutHelper.AddRow(layout, "Steam 账号", SettingsLayoutHelper.CreateInput(true));
            steamPassword = SettingsLayoutHelper.AddRow(
                layout,
                "Steam 密码",
                SettingsLayoutHelper.CreatePasswordInput());

            AntButton browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            var installPanel = new FlowLayoutPanel
            {
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = Padding.Empty,
                Padding = Padding.Empty,
            };
            installDir = SettingsLayoutHelper.CreateInput(true);
            installDir.Width = UiScaleHelper.Scale(360);
            AntInput installDirField = installDir;
            browseButton.Click += delegate
            {
                using (var dialog = new FolderBrowserDialog())
                {
                    if (dialog.ShowDialog(this) == DialogResult.OK)
                    {
                        installDirField.Text = dialog.SelectedPath;
                    }
                }
            };
            installPanel.Controls.Add(installDir);
            installPanel.Controls.Add(browseButton);
            SettingsLayoutHelper.AddRow(layout, "装服目录", installPanel);

            installDedicated = SettingsLayoutHelper.AddRow(
                layout,
                "SteamCMD",
                SettingsLayoutHelper.CreateCheckbox("安装/更新专用服务器到装服目录", true));

            AntButton downloadButton = SettingsLayoutHelper.CreateButton(
                "下载 SteamCMD");
            downloadButton.Margin = new Padding(0, UiScaleHelper.Scale(8), 0, 0);
            downloadButton.Click += OnDownloadSteamCmd;
            int downloadRow = layout.RowCount;
            layout.RowCount++;
            layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            downloadButton.Anchor = AnchorStyles.Left | AnchorStyles.Top;
            layout.Controls.Add(downloadButton, 0, downloadRow);
            layout.SetColumnSpan(downloadButton, 2);

            string extensionDirectory = SteamCmdBootstrapper.GetBundledDirectory(appServices.Paths);
            AntLabel steamCmdPathHint = AntdUiHelper.CreateHintLabel(
                "SteamCMD 目录：" + extensionDirectory,
                520);
            AntLabel hint = AntdUiHelper.CreateHintLabel(
                "此步可跳过（若已安装专用服务器）。账号用于 SteamCMD 下载；装服目录将作为服务器目录。",
                520);

            var stack = SettingsLayoutHelper.CreateSectionsStack();
            SettingsLayoutHelper.AddStackSection(stack, AntdUiHelper.CreateHintLabel(UiLabels.PathRulesHint, 520));
            SettingsLayoutHelper.AddStackSection(stack, steamCmdPathHint);
            SettingsLayoutHelper.AddStackSection(stack, hint);
            SettingsLayoutHelper.AddStackSection(stack, layout);

            panel.Controls.Add(SettingsLayoutHelper.CreateScrollHost(stack));
            return panel;
        }

        private AntPanel BuildConfigureStep(
            out AntInput name,
            out AntInput dir,
            out AntInput hostName,
            out AntInputNumber port,
            out AntInputNumber maxPlayers,
            out AntCheckbox battlEye,
            out AntInput rconPassword,
            out AntInputNumber rconPort,
            out AntCheckbox writeCfg)
        {
            var panel = new AntPanel { Dock = DockStyle.Fill };
            var layout = SettingsLayoutHelper.CreateFormLayout(120);

            name = SettingsLayoutHelper.AddRow(layout, "配置名称", SettingsLayoutHelper.CreateInput(true));
            name.Text = "我的服务器";

            AntButton browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            var dirPanel = new FlowLayoutPanel
            {
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = Padding.Empty,
                Padding = Padding.Empty,
            };
            dir = SettingsLayoutHelper.CreateInput(true);
            dir.Width = UiScaleHelper.Scale(380);
            AntInput dirField = dir;
            browseButton.Click += delegate
            {
                using (var dialog = new FolderBrowserDialog())
                {
                    if (dialog.ShowDialog(this) == DialogResult.OK)
                    {
                        dirField.Text = dialog.SelectedPath;
                    }
                }
            };
            dirPanel.Controls.Add(dir);
            dirPanel.Controls.Add(browseButton);
            SettingsLayoutHelper.AddRow(layout, "服务器目录", dirPanel);

            hostName = SettingsLayoutHelper.AddRow(layout, "主机名", SettingsLayoutHelper.CreateInput(true));
            hostName.Text = "Arma 3 Server";
            port = SettingsLayoutHelper.AddRow(
                layout,
                "游戏端口",
                SettingsLayoutHelper.CreateNumeric(1, 65535, 2302, 120));
            maxPlayers = SettingsLayoutHelper.AddRow(
                layout,
                "最大玩家",
                SettingsLayoutHelper.CreateNumeric(1, 200, 64, 120));
            battlEye = SettingsLayoutHelper.AddRow(
                layout,
                "BattlEye",
                SettingsLayoutHelper.CreateCheckbox("启用 BattlEye 反作弊", true));
            rconPassword = SettingsLayoutHelper.AddRow(
                layout,
                "RCon 密码",
                SettingsLayoutHelper.CreatePasswordInput());
            rconPort = SettingsLayoutHelper.AddRow(
                layout,
                "RCon 端口",
                SettingsLayoutHelper.CreateNumeric(1024, 65535, 2310, 120));
            writeCfg = SettingsLayoutHelper.AddRow(
                layout,
                "完成后",
                SettingsLayoutHelper.CreateCheckbox("保存到工具并应用到服务器目录", true));

            panel.Controls.Add(SettingsLayoutHelper.CreateScrollHost(layout));
            return panel;
        }

        private void ShowStep(int step)
        {
            currentStep = step;
            prepareStepPanel.Visible = step == StepPrepare;
            configureStepPanel.Visible = step == StepConfigure;
            backButton.Visible = step != StepPrepare;
            skipButton.Visible = step == StepPrepare;

            if (step == StepPrepare)
            {
                stepTitleLabel.Text = "步骤 1/2 · 环境准备";
                nextButton.Text = "下一步";
            }
            else
            {
                stepTitleLabel.Text = "步骤 2/2 · 服务器配置";
                nextButton.Text = "完成";
                if (string.IsNullOrWhiteSpace(dirInput.Text)
                    && !string.IsNullOrWhiteSpace(installDirInput.Text))
                {
                    dirInput.Text = installDirInput.Text.Trim();
                }
            }
        }

        private async void OnDownloadSteamCmd(object sender, EventArgs e)
        {
            if (isBusy)
            {
                return;
            }

            SetBusy(true);
            try
            {
                OperationResult result = await SteamCmdUiHelper.DownloadSteamCmdAsync(
                    this,
                    appServices.SteamCmdService,
                    appServices.Paths).ConfigureAwait(true);
                if (result.Success)
                {
                    AntdUiHelper.ShowInfo(this, result.Message, "SteamCMD");
                }
                else
                {
                    AntdUiHelper.ShowError(this, result.Message, "失败");
                }
            }
            finally
            {
                SetBusy(false);
            }
        }

        private void OnBack(object sender, EventArgs e)
        {
            if (currentStep == StepConfigure)
            {
                ShowStep(StepPrepare);
            }
        }

        private void OnSkip(object sender, EventArgs e)
        {
            if (currentStep == StepPrepare)
            {
                ShowStep(StepConfigure);
            }
        }

        private void OnNext(object sender, EventArgs e)
        {
            if (isBusy)
            {
                return;
            }

            if (currentStep == StepPrepare)
            {
                if (!ValidatePrepareStep())
                {
                    return;
                }

                ShowStep(StepConfigure);
                return;
            }

            RunPrimaryActionAsync(FinishAsync);
        }

        private bool ValidatePrepareStep()
        {
            string installDir = installDirInput.Text.Trim();
            if (installDedicatedCheckBox.Checked)
            {
                if (string.IsNullOrEmpty(installDir))
                {
                    AntdUiHelper.ShowWarning(this, "请选择装服目录，或取消勾选安装专用服务器。", "提示");
                    return false;
                }

                if (string.IsNullOrEmpty(steamUserInput.Text.Trim()))
                {
                    AntdUiHelper.ShowWarning(this, "勾选安装专用服务器时需填写 Steam 账号。", "提示");
                    return false;
                }
            }

            if (!string.IsNullOrEmpty(installDir) && PathValidation.ContainsChinese(installDir))
            {
                AntdUiHelper.ShowWarning(this, UiLabels.PathRulesShort, "提示");
                return false;
            }

            return true;
        }

        private async void RunPrimaryActionAsync(Func<Task> action)
        {
            SetBusy(true);
            try
            {
                await action().ConfigureAwait(true);
            }
            finally
            {
                SetBusy(false);
            }
        }

        private async Task FinishAsync()
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

            if (PathValidation.ContainsChinese(dir) || WizardPathValidation.HasInvalidToolPaths(appServices.Paths))
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
                await ApplyPrepareStepAsync().ConfigureAwait(true);

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

        private async Task ApplyPrepareStepAsync()
        {
            string steamUser = steamUserInput.Text.Trim();
            string steamPassword = steamPasswordInput.Text;
            string installDir = installDirInput.Text.Trim();

            if (!string.IsNullOrEmpty(steamUser)
                || !string.IsNullOrEmpty(steamPassword)
                || !string.IsNullOrEmpty(installDir))
            {
                SteamcmdEntity settings = appServices.GetSteamCmdSettings() ?? new SteamcmdEntity();
                if (!string.IsNullOrEmpty(steamUser))
                {
                    settings.u = steamUser;
                }

                if (!string.IsNullOrEmpty(steamPassword))
                {
                    settings.p = steamPassword;
                }

                if (!string.IsNullOrEmpty(installDir))
                {
                    settings.i = installDir;
                }

                settings.d = SteamCmdBootstrapper.GetBundledDirectory(appServices.Paths);

                appServices.SaveSteamCmdSettings(settings);
                appServices.ModScannerService.EnsureDefaultWorkshopPath(settings);
            }

            if (!installDedicatedCheckBox.Checked || string.IsNullOrEmpty(installDir))
            {
                return;
            }

            if (!await SteamCmdUiHelper.EnsureSteamCmdAvailableAsync(
                this,
                appServices.SteamCmdService,
                appServices.Paths).ConfigureAwait(true))
            {
                throw new InvalidOperationException("SteamCMD 未就绪，无法安装专用服务器。");
            }

            OperationResult installResult = await Task.Run(
                () => appServices.SteamCmdService.InstallDedicatedServer(installDir),
                CancellationToken.None).ConfigureAwait(true);
            if (!installResult.Success)
            {
                throw new InvalidOperationException(installResult.Message);
            }
        }

        private void SetBusy(bool busy)
        {
            isBusy = busy;
            backButton.Enabled = !busy;
            nextButton.Enabled = !busy;
            skipButton.Enabled = !busy;
            cancelButton.Enabled = !busy;
        }
    }
}
