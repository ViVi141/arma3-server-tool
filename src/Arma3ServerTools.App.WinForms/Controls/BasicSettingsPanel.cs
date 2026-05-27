using System;
using System.Linq;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Validation;
using AntCheckbox = AntdUI.Checkbox;
using AntInput = AntdUI.Input;
using AntInputNumber = AntdUI.InputNumber;
using AntLabel = AntdUI.Label;
using AntSelect = AntdUI.Select;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class BasicSettingsPanel : UserControl, IServerSettingsPanel
    {
        private AntInput configNameTextBox;
        private AntInput serverDirTextBox;
        private AntInput hostNameTextBox;
        private AntInput passwordTextBox;
        private AntInputNumber maxPlayersNumeric;
        private AntInputNumber portNumeric;
        private AntCheckbox x64CheckBox;
        private AntCheckbox persistentCheckBox;
        private AntCheckbox autoInitCheckBox;
        private AntCheckbox skipLobbyCheckBox;
        private AntCheckbox drawingInMapCheckBox;
        private AntCheckbox statisticsCheckBox;
        private AntSelect rotorLibCombo;
        private AntInput motdTextBox;
        private AntInputNumber motdIntervalNumeric;
        private AntInput pidFileTextBox;
        private AntInput rankingTextBox;
        private AntCheckbox disableVonCheckBox;
        private AntInputNumber vonQualityNumeric;
        private AntSelect vonCodecCombo;
        private AntdStringListEditor headlessEditor;
        private AntdStringListEditor localClientEditor;
        private AntCheckbox enableHeadlessClientCheckBox;
        private AntInputNumber voteThresholdNumeric;
        private AntInputNumber votingTimeoutNumeric;
        private AntInputNumber roleTimeoutNumeric;
        private AntInputNumber briefingTimeoutNumeric;
        private AntInputNumber debriefingTimeoutNumeric;
        private AntInputNumber lobbyIdleTimeoutNumeric;
        private AntInputNumber voteMissionPlayersNumeric;
        private AntInput serverCfgArgsTextBox;
        private AntInput basicCfgArgsTextBox;
        private AntInput startArgsTextBox;
        private AntInput profileArgsTextBox;

        private ArmaServerConfig boundConfig;

        public BasicSettingsPanel()
        {
            AppTheme.ApplyTo(this);
            Dock = DockStyle.Fill;
            var root = SettingsLayoutHelper.CreateSectionsStack();
            AntLabel pathHint = AntdUiHelper.CreateHintLabel(UiLabels.PathRulesHint, 640);
            SettingsLayoutHelper.AddStackSection(root, pathHint);
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("基础", BuildBasicRows()));
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("欢迎语 / 文件", BuildMotdRows()));
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("语音 (VoN)", BuildVoiceRows()));
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("无头客户端", BuildHeadlessRows()));
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("投票 / 超时", BuildVoteRows()));
            AntLabel extraArgsHint = AntdUiHelper.CreateHintLabel(
                "以下附加参数字段保存时会自动进行 Base64 编码。请直接输入原始文本内容，"
                + "不要粘贴已编码的字符串（否则会被二次编码导致数据损坏）。",
                640);
            SettingsLayoutHelper.AddStackSection(root, extraArgsHint);
            SettingsLayoutHelper.AddStackSection(
                root,
                SettingsLayoutHelper.CreateGroup(UiLabels.ExtraArgsGroup, BuildExtraArgsRows()));
            Controls.Add(SettingsLayoutHelper.CreateScrollHost(root));
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            if (config == null)
            {
                Enabled = false;
                return;
            }

            Enabled = true;
            configNameTextBox.Text = config.ConfigName ?? string.Empty;
            serverDirTextBox.Text = config.ServerDir ?? string.Empty;
            hostNameTextBox.Text = config.ServerConfig.HostName ?? string.Empty;
            passwordTextBox.Text = config.ServerConfig.Password ?? string.Empty;
            maxPlayersNumeric.Value = SettingsLayoutHelper.Clamp(2, 200, config.ServerConfig.MaxPlayers);
            portNumeric.Value = SettingsLayoutHelper.Clamp(1024, 65535, config.StartupParameters.Port);
            x64CheckBox.Checked = config.x64;
            persistentCheckBox.Checked = config.ServerConfig.Persistent;
            autoInitCheckBox.Checked = config.StartupParameters.AutoInit;
            skipLobbyCheckBox.Checked = config.ServerConfig.SkipLobby;
            drawingInMapCheckBox.Checked = config.ServerConfig.DrawingInMap;
            statisticsCheckBox.Checked = config.ServerConfig.StatisticsEnabled == 1;
            rotorLibCombo.SelectedIndex =
                SettingsLayoutHelper.Clamp(0, 2, config.ServerConfig.ForceRotorLibSimulation);
            motdTextBox.Text =
                string.Join(Environment.NewLine, config.ServerConfig.Motd ??
                    new System.Collections.Generic.List<string>());
            motdIntervalNumeric.Value =
                SettingsLayoutHelper.Clamp(1, 60, config.ServerConfig.MotdInterval);
            pidFileTextBox.Text = config.StartupParameters.PidFile ?? string.Empty;
            rankingTextBox.Text = config.StartupParameters.Ranking ?? string.Empty;
            // DisableVoN: 字段名与 UI 标签语义相反 → 值 0=启用(Checked=true)，值 1=禁用(Checked=false)
            disableVonCheckBox.Checked = config.ServerConfig.DisableVoN == 0;
            vonQualityNumeric.Value =
                SettingsLayoutHelper.Clamp(0, 30, config.ServerConfig.VonCodecQuality);
            vonCodecCombo.SelectedIndex =
                SettingsLayoutHelper.Clamp(0, 1, config.ServerConfig.VonCodec);
            headlessEditor.SetItems(config.ServerConfig.HeadlessClients);
            localClientEditor.SetItems(config.ServerConfig.LocalClient);
            enableHeadlessClientCheckBox.Checked = config.ServerTaskManagement.EnableHeadlessClient;
            voteThresholdNumeric.Value = config.ServerConfig.VoteThreshold;
            votingTimeoutNumeric.Value =
                SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.VotingTimeOut);
            roleTimeoutNumeric.Value =
                SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.RoleTimeOut);
            briefingTimeoutNumeric.Value =
                SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.BriefingTimeOut);
            debriefingTimeoutNumeric.Value =
                SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.DebriefingTimeOut);
            lobbyIdleTimeoutNumeric.Value =
                SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.LobbyIdleTimeout);
            voteMissionPlayersNumeric.Value =
                SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.VoteMissionPlayers);
            serverCfgArgsTextBox.Text = Base64Helper.Decode(config.ServerConfig.ServerConfigArgs);
            basicCfgArgsTextBox.Text = Base64Helper.Decode(config.BasicConfig.BasicConfigArgs);
            startArgsTextBox.Text = Base64Helper.Decode(config.StartupParameters.StartConfigArgs);
            profileArgsTextBox.Text = Base64Helper.Decode(config.serverProfile.ServerProfileArgs);
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            boundConfig.ConfigName = configNameTextBox.Text.Trim();
            boundConfig.ServerDir = serverDirTextBox.Text.Trim();
            boundConfig.ServerConfig.HostName = hostNameTextBox.Text.Trim();
            boundConfig.ServerConfig.Password = passwordTextBox.Text;
            boundConfig.ServerConfig.MaxPlayers = (int)maxPlayersNumeric.Value;
            boundConfig.StartupParameters.Port = (int)portNumeric.Value;
            boundConfig.x64 = x64CheckBox.Checked;
            boundConfig.ServerConfig.Persistent = persistentCheckBox.Checked;
            boundConfig.StartupParameters.AutoInit = autoInitCheckBox.Checked;
            boundConfig.ServerConfig.SkipLobby = skipLobbyCheckBox.Checked;
            boundConfig.ServerConfig.DrawingInMap = drawingInMapCheckBox.Checked;
            if (statisticsCheckBox.Checked)
            {
                boundConfig.ServerConfig.StatisticsEnabled = 1;
            }
            else
            {
                boundConfig.ServerConfig.StatisticsEnabled = 0;
            }

            boundConfig.ServerConfig.ForceRotorLibSimulation = rotorLibCombo.SelectedIndex;
            boundConfig.ServerConfig.Motd = motdTextBox.Text
                .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(line => line.Trim())
                .Where(line => !string.IsNullOrEmpty(line))
                .ToList();
            boundConfig.ServerConfig.MotdInterval = (int)motdIntervalNumeric.Value;
            boundConfig.StartupParameters.PidFile = pidFileTextBox.Text.Trim();
            boundConfig.StartupParameters.Ranking = rankingTextBox.Text.Trim();
            // DisableVoN: UI 标签"启用 VoN"与字段名"禁用语声"语义相反，勾选→0=启用，未勾选→1=禁用
            if (disableVonCheckBox.Checked)
            {
                boundConfig.ServerConfig.DisableVoN = 0;
            }
            else
            {
                boundConfig.ServerConfig.DisableVoN = 1;
            }

            boundConfig.ServerConfig.VonCodecQuality = (int)vonQualityNumeric.Value;
            boundConfig.ServerConfig.VonCodec = vonCodecCombo.SelectedIndex;
            boundConfig.ServerConfig.HeadlessClients = headlessEditor.GetItemsCopy();
            boundConfig.ServerConfig.LocalClient = localClientEditor.GetItemsCopy();
            boundConfig.ServerTaskManagement.EnableHeadlessClient = enableHeadlessClientCheckBox.Checked;
            boundConfig.ServerConfig.VoteThreshold = (int)voteThresholdNumeric.Value;
            boundConfig.ServerConfig.VotingTimeOut = (int)votingTimeoutNumeric.Value;
            boundConfig.ServerConfig.RoleTimeOut = (int)roleTimeoutNumeric.Value;
            boundConfig.ServerConfig.BriefingTimeOut = (int)briefingTimeoutNumeric.Value;
            boundConfig.ServerConfig.DebriefingTimeOut = (int)debriefingTimeoutNumeric.Value;
            boundConfig.ServerConfig.LobbyIdleTimeout = (int)lobbyIdleTimeoutNumeric.Value;
            boundConfig.ServerConfig.VoteMissionPlayers = (int)voteMissionPlayersNumeric.Value;
            boundConfig.ServerConfig.ServerConfigArgs = Base64Helper.Encode(serverCfgArgsTextBox.Text);
            boundConfig.BasicConfig.BasicConfigArgs = Base64Helper.Encode(basicCfgArgsTextBox.Text);
            boundConfig.StartupParameters.StartConfigArgs = Base64Helper.Encode(startArgsTextBox.Text);
            boundConfig.serverProfile.ServerProfileArgs = Base64Helper.Encode(profileArgsTextBox.Text);
        }

        private Control BuildBasicRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            configNameTextBox = SettingsLayoutHelper.AddRow(
                layout,
                "配置名称",
                SettingsLayoutHelper.CreateReadOnlyInput(0));
            serverDirTextBox = SettingsLayoutHelper.CreateReadOnlyInput(0);
            var browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            browseButton.Click += OnBrowseServerDir;
            SettingsLayoutHelper.AddRow(
                layout,
                "服务器目录",
                SettingsLayoutHelper.CreateInlineFieldRow(serverDirTextBox, browseButton));
            hostNameTextBox = SettingsLayoutHelper.AddRow(layout, "服务器昵称", SettingsLayoutHelper.CreateInput(true));
            Control pwdContainer = SettingsLayoutHelper.CreatePasswordInputWithToggle(out AntInput pwdInput);
            passwordTextBox = pwdInput;
            SettingsLayoutHelper.AddRow(layout, "服务器密码", pwdContainer);
            maxPlayersNumeric = SettingsLayoutHelper.AddRow(layout, "最大人数", SettingsLayoutHelper.CreateNumeric(2, 200, 10, 120));
            portNumeric =
                SettingsLayoutHelper.AddRow(layout, "端口", SettingsLayoutHelper.CreateNumeric(1024, 65535, 2302, 120));
            x64CheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "64 位程序",
                    SettingsLayoutHelper.CreateCheckbox("使用 arma3server_x64.exe", true));
            persistentCheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "任务持久化",
                    SettingsLayoutHelper.CreateCheckbox("重启后保留任务进度", false));
            autoInitCheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "自动初始化",
                    SettingsLayoutHelper.CreateCheckbox("启动时自动加载任务 (-autoInit)", false));
            skipLobbyCheckBox =
                SettingsLayoutHelper.AddRow(layout, "跳过大厅", SettingsLayoutHelper.CreateCheckbox("跳过任务选择大厅", false));
            drawingInMapCheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "地图绘制",
                    SettingsLayoutHelper.CreateCheckbox("允许玩家在地图上绘制", true));
            statisticsCheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "官方统计",
                    SettingsLayoutHelper.CreateCheckbox("向 Bohemia 上报统计数据", false));
            rotorLibCombo = SettingsLayoutHelper.AddRow(
                layout,
                "旋翼库模拟",
                SettingsLayoutHelper.CreateSelect(200, "由玩家决定", "强制高级飞行模型", "强制简化飞行模型"));
            return layout;
        }

        private Control BuildMotdRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            motdTextBox =
                SettingsLayoutHelper.AddRow(layout, "欢迎语 (MOTD)", SettingsLayoutHelper.CreateMultilineInput(70));
            motdIntervalNumeric =
                SettingsLayoutHelper.AddRow(layout, "欢迎语间隔 (分钟)", SettingsLayoutHelper.CreateNumeric(1, 60, 1, 120));
            pidFileTextBox = SettingsLayoutHelper.AddRow(layout, "进程 PID 文件", SettingsLayoutHelper.CreateInput(true));
            rankingTextBox = SettingsLayoutHelper.AddRow(layout, "排名数据文件", SettingsLayoutHelper.CreateInput(true));
            return layout;
        }

        private Control BuildVoiceRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            disableVonCheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "语音聊天",
                    SettingsLayoutHelper.CreateCheckbox("启用 VoN 语音", true));
            vonQualityNumeric =
                SettingsLayoutHelper.AddRow(layout, "语音质量", SettingsLayoutHelper.CreateNumeric(0, 30, 30, 120));
            vonCodecCombo = SettingsLayoutHelper.AddRow(layout, "语音编码", SettingsLayoutHelper.CreateSelect(200, "SPEEX", "OPUS"));
            return layout;
        }

        private Control BuildHeadlessRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(SettingsLayoutHelper.DefaultLabelWidth);
            enableHeadlessClientCheckBox = SettingsLayoutHelper.AddRow(
                layout, "自动启动", SettingsLayoutHelper.CreateCheckbox("启动服务器时同时启动无头客户端进程", false));
            headlessEditor = CreateIpv4ListEditor(70, "127.0.0.1");
            localClientEditor = CreateIpv4ListEditor(70, "127.0.0.1");
            SettingsLayoutHelper.AddRow(layout, "无头客户端 IP", headlessEditor, 80);
            SettingsLayoutHelper.AddRow(layout, "本地客户端 IP", localClientEditor, 80);

            return layout;
        }

        private static AntdStringListEditor CreateIpv4ListEditor(int logicalHeight, string defaultIp)
        {
            return new AntdStringListEditor(
                logicalHeight,
                trimmed =>
                {
                    if (IPv4Tools.ValidateIPAddress(trimmed))
                    {
                        return null;
                    }

                    return "IP 地址格式无效。";
                },
                "添加 IP",
                "输入 IP 地址",
                defaultIp,
                "无效 IP");
        }

        private Control BuildVoteRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(140);
            voteThresholdNumeric =
                SettingsLayoutHelper.AddRow(layout, "投票通过阈值 (%)", SettingsLayoutHelper.CreateNumeric(0, 100, 0, 120));
            votingTimeoutNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "投票超时 (秒)",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 0, 120));
            roleTimeoutNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "选角超时 (秒)",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 99999, 120));
            briefingTimeoutNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "简报超时 (秒)",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 60, 120));
            debriefingTimeoutNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "结算超时 (秒)",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 45, 120));
            lobbyIdleTimeoutNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "大厅空闲超时 (秒)",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 99999, 120));
            voteMissionPlayersNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "换图最少人数",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 0, 120));
            return layout;
        }

        private Control BuildExtraArgsRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(140);
            serverCfgArgsTextBox =
                SettingsLayoutHelper.AddRow(layout, "server.cfg 附加行", SettingsLayoutHelper.CreateMultilineInput(72));
            basicCfgArgsTextBox =
                SettingsLayoutHelper.AddRow(layout, "basic.cfg 附加行", SettingsLayoutHelper.CreateMultilineInput(72));
            startArgsTextBox =
                SettingsLayoutHelper.AddRow(layout, "启动命令行附加", SettingsLayoutHelper.CreateMultilineInput(72));
            profileArgsTextBox =
                SettingsLayoutHelper.AddRow(layout, "Arma3Profile 附加行", SettingsLayoutHelper.CreateMultilineInput(72));
            return layout;
        }

        private void OnBrowseServerDir(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            using (var dialog = new FolderBrowserDialog())
            {
                if (!string.IsNullOrEmpty(serverDirTextBox.Text))
                {
                    dialog.SelectedPath = serverDirTextBox.Text;
                }

                if (dialog.ShowDialog(FindForm()) == DialogResult.OK)
                {
                    serverDirTextBox.Text = dialog.SelectedPath;
                }
            }
        }
    }
}