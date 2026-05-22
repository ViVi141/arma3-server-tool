using System;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Validation;
using AntCheckbox = AntdUI.Checkbox;
using AntInput = AntdUI.Input;
using AntInputNumber = AntdUI.InputNumber;
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
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("基础", BuildBasicRows()));
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("MOTD / 文件", BuildMotdRows()));
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("语音 VoN", BuildVoiceRows()));
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("无头客户端", BuildHeadlessRows()));
            SettingsLayoutHelper.AddStackSection(root, SettingsLayoutHelper.CreateGroup("投票 / 超时", BuildVoteRows()));
            SettingsLayoutHelper.AddStackSection(
                root,
                SettingsLayoutHelper.CreateGroup("附加参数 (明文，保存时转 Base64)", BuildExtraArgsRows()));
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
            disableVonCheckBox.Checked = config.ServerConfig.DisableVoN == 0;
            vonQualityNumeric.Value =
                SettingsLayoutHelper.Clamp(0, 30, config.ServerConfig.VonCodecQuality);
            vonCodecCombo.SelectedIndex =
                SettingsLayoutHelper.Clamp(0, 1, config.ServerConfig.VonCodec);
            headlessEditor.SetItems(config.ServerConfig.HeadlessClients);
            localClientEditor.SetItems(config.ServerConfig.LocalClient);
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
            serverCfgArgsTextBox.Text = DecodeBase64(config.ServerConfig.ServerConfigArgs);
            basicCfgArgsTextBox.Text = DecodeBase64(config.BasicConfig.BasicConfigArgs);
            startArgsTextBox.Text = DecodeBase64(config.StartupParameters.StartConfigArgs);
            profileArgsTextBox.Text = DecodeBase64(config.serverProfile.ServerProfileArgs);
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
            boundConfig.ServerConfig.VoteThreshold = (int)voteThresholdNumeric.Value;
            boundConfig.ServerConfig.VotingTimeOut = (int)votingTimeoutNumeric.Value;
            boundConfig.ServerConfig.RoleTimeOut = (int)roleTimeoutNumeric.Value;
            boundConfig.ServerConfig.BriefingTimeOut = (int)briefingTimeoutNumeric.Value;
            boundConfig.ServerConfig.DebriefingTimeOut = (int)debriefingTimeoutNumeric.Value;
            boundConfig.ServerConfig.LobbyIdleTimeout = (int)lobbyIdleTimeoutNumeric.Value;
            boundConfig.ServerConfig.VoteMissionPlayers = (int)voteMissionPlayersNumeric.Value;
            boundConfig.ServerConfig.ServerConfigArgs = EncodeBase64(serverCfgArgsTextBox.Text);
            boundConfig.BasicConfig.BasicConfigArgs = EncodeBase64(basicCfgArgsTextBox.Text);
            boundConfig.StartupParameters.StartConfigArgs = EncodeBase64(startArgsTextBox.Text);
            boundConfig.serverProfile.ServerProfileArgs = EncodeBase64(profileArgsTextBox.Text);
        }

        private Control BuildBasicRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(120);
            configNameTextBox = SettingsLayoutHelper.AddRow(layout, "配置名称", SettingsLayoutHelper.CreateInput(true));
            serverDirTextBox = SettingsLayoutHelper.CreateReadOnlyInput(0);
            var browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            browseButton.Click += OnBrowseServerDir;
            SettingsLayoutHelper.AddRow(
                layout,
                "服务器目录",
                SettingsLayoutHelper.CreateInlineFieldRow(serverDirTextBox, browseButton));
            hostNameTextBox = SettingsLayoutHelper.AddRow(layout, "服务器昵称", SettingsLayoutHelper.CreateInput(true));
            passwordTextBox = SettingsLayoutHelper.AddRow(layout, "服务器密码", SettingsLayoutHelper.CreatePasswordInput());
            maxPlayersNumeric = SettingsLayoutHelper.AddRow(layout, "最大人数", SettingsLayoutHelper.CreateNumeric(2, 200, 10, 120));
            portNumeric =
                SettingsLayoutHelper.AddRow(layout, "端口", SettingsLayoutHelper.CreateNumeric(1024, 65535, 2302, 120));
            x64CheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "x64",
                    SettingsLayoutHelper.CreateCheckbox("使用 arma3server_x64.exe", true));
            persistentCheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "Persistent",
                    SettingsLayoutHelper.CreateCheckbox("任务持久化", false));
            autoInitCheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "AutoInit",
                    SettingsLayoutHelper.CreateCheckbox("-autoInit", false));
            skipLobbyCheckBox =
                SettingsLayoutHelper.AddRow(layout, "SkipLobby", SettingsLayoutHelper.CreateCheckbox("跳过大厅", false));
            drawingInMapCheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "DrawingInMap",
                    SettingsLayoutHelper.CreateCheckbox("允许地图绘制", true));
            statisticsCheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "Statistics",
                    SettingsLayoutHelper.CreateCheckbox("启用官方统计", false));
            rotorLibCombo = SettingsLayoutHelper.AddRow(
                layout,
                "RotorLib",
                SettingsLayoutHelper.CreateSelect(200, "玩家决定", "强制 AFM", "强制 SFM"));
            return layout;
        }

        private Control BuildMotdRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(120);
            motdTextBox =
                SettingsLayoutHelper.AddRow(layout, "MOTD", SettingsLayoutHelper.CreateMultilineInput(70));
            motdIntervalNumeric =
                SettingsLayoutHelper.AddRow(layout, "MOTD 间隔", SettingsLayoutHelper.CreateNumeric(1, 60, 1, 120));
            pidFileTextBox = SettingsLayoutHelper.AddRow(layout, "PID 文件", SettingsLayoutHelper.CreateInput(true));
            rankingTextBox = SettingsLayoutHelper.AddRow(layout, "Ranking", SettingsLayoutHelper.CreateInput(true));
            return layout;
        }

        private Control BuildVoiceRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(120);
            disableVonCheckBox =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "VoN",
                    SettingsLayoutHelper.CreateCheckbox("启用语音", true));
            vonQualityNumeric =
                SettingsLayoutHelper.AddRow(layout, "语音质量", SettingsLayoutHelper.CreateNumeric(0, 30, 30, 120));
            vonCodecCombo = SettingsLayoutHelper.AddRow(layout, "编码器", SettingsLayoutHelper.CreateSelect(200, "SPEEX", "OPUS"));
            return layout;
        }

        private Control BuildHeadlessRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(120);
            headlessEditor = CreateIpv4ListEditor(70, "127.0.0.1");
            localClientEditor = CreateIpv4ListEditor(70, "127.0.0.1");
            SettingsLayoutHelper.AddRow(layout, "HeadlessClients", headlessEditor, 80);
            SettingsLayoutHelper.AddRow(layout, "LocalClient", localClientEditor, 80);
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
                SettingsLayoutHelper.AddRow(layout, "VoteThreshold", SettingsLayoutHelper.CreateNumeric(0, 100, 0, 120));
            votingTimeoutNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "VotingTimeOut",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 0, 120));
            roleTimeoutNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "RoleTimeOut",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 99999, 120));
            briefingTimeoutNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "BriefingTimeOut",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 60, 120));
            debriefingTimeoutNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "DebriefingTimeOut",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 45, 120));
            lobbyIdleTimeoutNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "LobbyIdleTimeout",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 99999, 120));
            voteMissionPlayersNumeric =
                SettingsLayoutHelper.AddRow(
                    layout,
                    "VoteMissionPlayers",
                    SettingsLayoutHelper.CreateNumeric(0, 99999, 0, 120));
            return layout;
        }

        private Control BuildExtraArgsRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(140);
            serverCfgArgsTextBox =
                SettingsLayoutHelper.AddRow(layout, "server.cfg", SettingsLayoutHelper.CreateMultilineInput(72));
            basicCfgArgsTextBox =
                SettingsLayoutHelper.AddRow(layout, "basic.cfg", SettingsLayoutHelper.CreateMultilineInput(72));
            startArgsTextBox =
                SettingsLayoutHelper.AddRow(layout, "启动参数", SettingsLayoutHelper.CreateMultilineInput(72));
            profileArgsTextBox =
                SettingsLayoutHelper.AddRow(layout, "Profile", SettingsLayoutHelper.CreateMultilineInput(72));
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

        private static string DecodeBase64(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            try
            {
                return Encoding.Default.GetString(Convert.FromBase64String(value));
            }
            catch
            {
                return string.Empty;
            }
        }

        private static string EncodeBase64(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            return Convert.ToBase64String(Encoding.Default.GetBytes(value));
        }
    }
}
