using System;
using System.Diagnostics;
using System.Drawing;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.Application.Agent;
using Arma3ServerTools.Core;
using AntButton = AntdUI.Button;
using AntCheckbox = AntdUI.Checkbox;
using AntInput = AntdUI.Input;
using AntInputNumber = AntdUI.InputNumber;
using AntLabel = AntdUI.Label;
using AntSelect = AntdUI.Select;

namespace Arma3ServerTools.App.WinForms.Dialogs
{
    internal sealed class AgentSettingsForm : AntdDialogForm
    {
        private readonly IAppServices appServices;
        private readonly AgentSettingsService agentSettingsService;
        private readonly AgentScheduledTaskService agentScheduledTaskService;
        private readonly AgentSettings settings;
        private bool suppressPresetEvents;

        private AntSelect presetSelect;
        private AntCheckbox httpEnabledCheckBox;
        private AntInputNumber portInput;
        private AntInput tokenInput;
        private AntCheckbox remoteAccessCheckBox;
        private AntInput allowedIpsInput;
        private AntLabel localUrlLabel;
        private AntLabel publicUrlLabel;
        private AntLabel statusLabel;
        private AntButton autoStartButton;

        public AgentSettingsForm(IAppServices appServices)
        {
            this.appServices = appServices ?? throw new ArgumentNullException(nameof(appServices));
            agentSettingsService = appServices.AgentSettings;
            agentScheduledTaskService = appServices.AgentScheduledTasks;
            settings = agentSettingsService.LoadOrCreate();

            Text = "Agent / OpenClaw 设置";
            ApplyPreferredDialogSizing(560, 620, null);

            var layout = SettingsLayoutHelper.CreateFormLayout(132);
            presetSelect = SettingsLayoutHelper.AddRow(
                layout,
                "使用场景",
                CreatePresetSelect());
            httpEnabledCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "启用 API",
                SettingsLayoutHelper.CreateCheckbox("启用 HTTP 自动化 API", true));
            portInput = SettingsLayoutHelper.AddRow(
                layout,
                "端口",
                SettingsLayoutHelper.CreateNumeric(1024, 65535, 19580, 120));
            SettingsLayoutHelper.AddRow(
                layout,
                "API Token",
                CreateTokenRow());
            remoteAccessCheckBox = SettingsLayoutHelper.AddRow(
                layout,
                "远程访问",
                SettingsLayoutHelper.CreateCheckbox("允许局域网其他电脑连接（OpenClaw 在另一台机器时）", false));
            allowedIpsInput = SettingsLayoutHelper.AddRow(
                layout,
                "来访 IP 白名单",
                SettingsLayoutHelper.CreateInput(true));
            localUrlLabel = SettingsLayoutHelper.AddRow(
                layout,
                "本机地址",
                CreateReadOnlyUrlLabel());
            publicUrlLabel = SettingsLayoutHelper.AddRow(
                layout,
                "OpenClaw 填写",
                CreateReadOnlyUrlLabel());

            statusLabel = new AntLabel
            {
                AutoSizeMode = AntdUI.TAutoSize.None,
                Height = UiScaleHelper.Scale(64),
                ForeColor = Color.Gray,
            };
            SettingsLayoutHelper.AddRow(layout, "运行状态", statusLabel, 72);

            autoStartButton = SettingsLayoutHelper.CreateButton("注册登录时自动启动");
            autoStartButton.Click += OnAutoStartButtonClick;
            SettingsLayoutHelper.AddRow(layout, "自动启动", autoStartButton);

            LoadSettingsToControls();
            WireControlEvents();
            RefreshDerivedFields();
            RefreshStatusLabel();

            AntButton testButton = SettingsLayoutHelper.CreateButton("测试连接");
            testButton.Click += OnTestConnection;

            AntButton startButton = SettingsLayoutHelper.CreateButton("启动 Agent");
            startButton.Click += OnStartAgent;

            AntButton copyButton = SettingsLayoutHelper.CreateButton("复制 OpenClaw 配置");
            copyButton.Click += OnCopyOpenClawConfig;

            AntButton openDirButton = SettingsLayoutHelper.CreateButton("打开配置目录");
            openDirButton.Click += OnOpenConfigDirectory;

            AntButton okButton = SettingsLayoutHelper.CreateButton("保存");
            okButton.Type = AntdUI.TTypeMini.Primary;
            okButton.Click += delegate
            {
                if (!TrySaveSettings())
                {
                    return;
                }

                DialogResult = DialogResult.OK;
                Close();
            };

            AntButton cancelButton = SettingsLayoutHelper.CreateButton("取消");
            cancelButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            var actionBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                FlowDirection = FlowDirection.LeftToRight,
                AutoSize = true,
                WrapContents = true,
                Padding = UiScaleHelper.ScalePadding(12, 4, 12, 0),
            };
            actionBar.Controls.Add(testButton);
            actionBar.Controls.Add(startButton);
            actionBar.Controls.Add(copyButton);
            actionBar.Controls.Add(openDirButton);

            Control buttonBar = CreateButtonBar(okButton, cancelButton, "保存", "取消");
            AntLabel hint = AntdUiHelper.CreateHintLabel(
                "OpenClaw / QQ 机器人请在本机或局域网通过 HTTP 调用 Agent。"
                + " 保存后需重启 Agent 生效。"
                + " 「登录时自动启动」与安装包选项相同，计划任务名：Arma3 Server Tools Agent。",
                520);
            hint.Dock = DockStyle.Top;

            Controls.Add(buttonBar);
            Controls.Add(actionBar);
            Controls.Add(hint);
            Controls.Add(SettingsLayoutHelper.CreateScrollHost(layout));
        }

        private AntSelect CreatePresetSelect()
        {
            var select = new AntSelect
            {
                List = true,
                Width = UiScaleHelper.Scale(320),
            };
            select.Items.Add(new AntdUI.SelectItem(0, "仅本机（OpenClaw 与 Agent 在同一台电脑）"));
            select.Items.Add(new AntdUI.SelectItem(1, "局域网远程（OpenClaw 在另一台电脑）"));
            select.Items.Add(new AntdUI.SelectItem(2, "自定义高级设置"));
            return select;
        }

        private Control CreateTokenRow()
        {
            var row = new FlowLayoutPanel
            {
                AutoSize = true,
                WrapContents = false,
                FlowDirection = FlowDirection.LeftToRight,
            };
            tokenInput = SettingsLayoutHelper.CreateInput(true);
            tokenInput.Width = UiScaleHelper.Scale(260);
            row.Controls.Add(tokenInput);

            AntButton copyButton = SettingsLayoutHelper.CreateButton("复制");
            copyButton.Margin = new Padding(UiScaleHelper.Scale(8), 0, 0, 0);
            copyButton.Click += delegate
            {
                if (!string.IsNullOrEmpty(tokenInput.Text))
                {
                    Clipboard.SetText(tokenInput.Text);
                    AntdUiHelper.ShowInfo(this, "Token 已复制到剪贴板。", "成功");
                }
            };
            row.Controls.Add(copyButton);

            AntButton regenButton = SettingsLayoutHelper.CreateButton("重新生成");
            regenButton.Margin = new Padding(UiScaleHelper.Scale(8), 0, 0, 0);
            regenButton.Click += delegate
            {
                agentSettingsService.RegenerateApiToken(settings);
                tokenInput.Text = settings.Http.ApiToken;
                RefreshDerivedFields();
            };
            row.Controls.Add(regenButton);
            return row;
        }

        private static AntLabel CreateReadOnlyUrlLabel()
        {
            return new AntLabel
            {
                AutoSizeMode = AntdUI.TAutoSize.None,
                Height = UiScaleHelper.Scale(24),
                ForeColor = Color.DimGray,
            };
        }

        private void LoadSettingsToControls()
        {
            suppressPresetEvents = true;
            try
            {
                AgentSetupPreset preset = agentSettingsService.DetectPreset(settings);
                presetSelect.SelectedIndex = (int)preset;
                httpEnabledCheckBox.Checked = settings.Http.Enabled;
                portInput.Value = SettingsLayoutHelper.Clamp(1024, 65535, settings.Http.ListenPort);
                tokenInput.Text = settings.Http.ApiToken ?? string.Empty;
                remoteAccessCheckBox.Checked = settings.Http.RemoteAccessEnabled;
                allowedIpsInput.Text = agentSettingsService.FormatAllowedCallerIps(settings);
            }
            finally
            {
                suppressPresetEvents = false;
            }
        }

        private void WireControlEvents()
        {
            presetSelect.SelectedIndexChanged += OnPresetChanged;
            portInput.ValueChanged += OnFieldChanged;
            remoteAccessCheckBox.CheckedChanged += OnFieldChanged;
            httpEnabledCheckBox.CheckedChanged += OnFieldChanged;
        }

        private void OnPresetChanged(object sender, AntdUI.IntEventArgs e)
        {
            if (suppressPresetEvents)
            {
                return;
            }

            AgentSetupPreset preset = (AgentSetupPreset)presetSelect.SelectedIndex;
            if (preset != AgentSetupPreset.Custom)
            {
                agentSettingsService.ApplyPreset(settings, preset);
                suppressPresetEvents = true;
                try
                {
                    httpEnabledCheckBox.Checked = settings.Http.Enabled;
                    portInput.Value = SettingsLayoutHelper.Clamp(1024, 65535, settings.Http.ListenPort);
                    remoteAccessCheckBox.Checked = settings.Http.RemoteAccessEnabled;
                }
                finally
                {
                    suppressPresetEvents = false;
                }
            }

            RefreshDerivedFields();
        }

        private void OnFieldChanged(object sender, EventArgs e)
        {
            if (suppressPresetEvents)
            {
                return;
            }

            if (presetSelect.SelectedIndex != (int)AgentSetupPreset.Custom)
            {
                suppressPresetEvents = true;
                try
                {
                    presetSelect.SelectedIndex = (int)AgentSetupPreset.Custom;
                }
                finally
                {
                    suppressPresetEvents = false;
                }
            }

            RefreshDerivedFields();
        }

        private void RefreshDerivedFields()
        {
            ApplyControlsToSettingsPreview();
            localUrlLabel.Text = agentSettingsService.ResolveLocalBaseUrl(settings);
            publicUrlLabel.Text = agentSettingsService.ResolvePublicBaseUrl(settings);
            allowedIpsInput.Enabled = remoteAccessCheckBox.Checked;
        }

        private void ApplyControlsToSettingsPreview()
        {
            settings.Http.Enabled = httpEnabledCheckBox.Checked;
            settings.Http.ListenPort = (int)portInput.Value;
            settings.Http.RemoteAccessEnabled = remoteAccessCheckBox.Checked;
            agentSettingsService.ParseAllowedCallerIps(allowedIpsInput.Text, settings);
            if (presetSelect.SelectedIndex == (int)AgentSetupPreset.LocalOnly)
            {
                settings.Http.ListenHost = "127.0.0.1";
                settings.Http.ListenPrefix = string.Empty;
            }
            else if (presetSelect.SelectedIndex == (int)AgentSetupPreset.LanOpenClaw)
            {
                settings.Http.ListenHost = "+";
                settings.Http.ListenPrefix = string.Empty;
                string lanIp = AgentSettingsService.TryGetPreferredLanIPv4();
                if (!string.IsNullOrEmpty(lanIp))
                {
                    settings.Http.PublicBaseUrl = "http://" + lanIp + ":" + settings.Http.ListenPort;
                }
            }
        }

        private void RefreshStatusLabel()
        {
            string processLine;
            if (agentSettingsService.IsAgentProcessRunning())
            {
                processLine = "Agent 进程：运行中";
            }
            else
            {
                processLine = "Agent 进程：未运行（可点「启动 Agent」）";
            }

            string taskLine;
            if (agentScheduledTaskService.IsAutoStartRegistered())
            {
                taskLine = "计划任务：已注册（登录 Windows 时自动启动）";
            }
            else
            {
                taskLine = "计划任务：未注册";
            }

            statusLabel.Text = processLine + Environment.NewLine + taskLine;
            if (agentSettingsService.IsAgentProcessRunning())
            {
                statusLabel.ForeColor = Color.ForestGreen;
            }
            else
            {
                statusLabel.ForeColor = Color.Gray;
            }

            if (agentScheduledTaskService.IsAutoStartRegistered())
            {
                autoStartButton.Text = "取消登录时自动启动";
            }
            else
            {
                autoStartButton.Text = "注册登录时自动启动";
            }
        }

        private void OnAutoStartButtonClick(object sender, EventArgs e)
        {
            OperationResult result;
            if (agentScheduledTaskService.IsAutoStartRegistered())
            {
                if (!AntdUiHelper.Confirm(
                    this,
                    "取消自动启动",
                    "确定删除计划任务「Arma3 Server Tools Agent」？"))
                {
                    return;
                }

                result = agentScheduledTaskService.UnregisterAutoStart();
            }
            else
            {
                if (!TrySaveSettings())
                {
                    return;
                }

                result = agentScheduledTaskService.RegisterAutoStart();
                if (result.Success)
                {
                    OperationResult runResult = agentScheduledTaskService.RunScheduledTaskNow();
                    if (runResult.Success)
                    {
                        result = OperationResult.Ok(result.Message + Environment.NewLine + "已尝试立即启动 Agent。");
                    }
                }
            }

            RefreshStatusLabel();
            if (result.Success)
            {
                AntdUiHelper.ShowInfo(this, result.Message, "计划任务");
            }
            else
            {
                AntdUiHelper.ShowError(this, result.Message, "计划任务");
            }
        }

        private bool TrySaveSettings()
        {
            ApplyControlsToSettingsPreview();
            settings.Http.ApiToken = tokenInput.Text.Trim();
            if (string.IsNullOrEmpty(settings.Http.ApiToken))
            {
                agentSettingsService.RegenerateApiToken(settings);
                tokenInput.Text = settings.Http.ApiToken;
            }

            try
            {
                agentSettingsService.Save(settings);
                return true;
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(this, "保存失败: " + ex.Message, "错误");
                return false;
            }
        }

        private async void OnTestConnection(object sender, EventArgs e)
        {
            ApplyControlsToSettingsPreview();
            AgentHealthProbeResult result = await agentSettingsService
                .ProbeHealthAsync(settings)
                .ConfigureAwait(true);
            if (result.Success)
            {
                AntdUiHelper.ShowInfo(this, result.Message, "连接成功");
            }
            else
            {
                AntdUiHelper.ShowWarning(
                    this,
                    result.Message + Environment.NewLine + "请先启动 Agent，或保存配置后重启 Agent。",
                    "无法连接");
            }
        }

        private void OnStartAgent(object sender, EventArgs e)
        {
            OperationResult result = agentSettingsService.TryStartAgent();
            RefreshStatusLabel();
            if (result.Success)
            {
                AntdUiHelper.ShowInfo(this, result.Message, "Agent");
            }
            else
            {
                AntdUiHelper.ShowError(this, result.Message, "启动失败");
            }
        }

        private void OnCopyOpenClawConfig(object sender, EventArgs e)
        {
            ApplyControlsToSettingsPreview();
            string snippet = agentSettingsService.BuildOpenClawEnvSnippet(settings);
            Clipboard.SetText(snippet);
            AntdUiHelper.ShowInfo(this, "OpenClaw 环境变量配置已复制到剪贴板。", "成功");
        }

        private void OnOpenConfigDirectory(object sender, EventArgs e)
        {
            string settingsPath = agentSettingsService.GetSettingsPath();
            string directory = System.IO.Path.GetDirectoryName(settingsPath);
            if (string.IsNullOrEmpty(directory))
            {
                return;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = directory,
                UseShellExecute = true,
            });
        }
    }
}
