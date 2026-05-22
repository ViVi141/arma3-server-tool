using System;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Windows.Forms;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Validation;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class BasicSettingsPanel : UserControl, IServerSettingsPanel
    {
        private TextBox configNameTextBox;
        private TextBox serverDirTextBox;
        private TextBox hostNameTextBox;
        private TextBox passwordTextBox;
        private NumericUpDown maxPlayersNumeric;
        private NumericUpDown portNumeric;
        private CheckBox x64CheckBox;
        private CheckBox persistentCheckBox;
        private CheckBox autoInitCheckBox;
        private CheckBox skipLobbyCheckBox;
        private CheckBox drawingInMapCheckBox;
        private CheckBox statisticsCheckBox;
        private ComboBox rotorLibCombo;
        private TextBox motdTextBox;
        private NumericUpDown motdIntervalNumeric;
        private TextBox pidFileTextBox;
        private TextBox rankingTextBox;
        private CheckBox disableVonCheckBox;
        private NumericUpDown vonQualityNumeric;
        private ComboBox vonCodecCombo;
        private ListBox headlessListBox;
        private ListBox localClientListBox;
        private NumericUpDown voteThresholdNumeric;
        private NumericUpDown votingTimeoutNumeric;
        private NumericUpDown roleTimeoutNumeric;
        private NumericUpDown briefingTimeoutNumeric;
        private NumericUpDown debriefingTimeoutNumeric;
        private NumericUpDown lobbyIdleTimeoutNumeric;
        private NumericUpDown voteMissionPlayersNumeric;
        private TextBox serverCfgArgsTextBox;
        private TextBox basicCfgArgsTextBox;
        private TextBox startArgsTextBox;
        private TextBox profileArgsTextBox;

        private ArmaServerConfig boundConfig;

        public BasicSettingsPanel()
        {
            Dock = DockStyle.Fill;
            var root = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 1 };
            root.Controls.Add(CreateGroup("基础", BuildBasicRows()));
            root.Controls.Add(CreateGroup("MOTD / 文件", BuildMotdRows()));
            root.Controls.Add(CreateGroup("语音 VoN", BuildVoiceRows()));
            root.Controls.Add(CreateGroup("无头客户端", BuildHeadlessRows()));
            root.Controls.Add(CreateGroup("投票 / 超时", BuildVoteRows()));
            root.Controls.Add(CreateGroup("附加参数 (明文，保存时转 Base64)", BuildExtraArgsRows()));
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
            rotorLibCombo.SelectedIndex = (int)SettingsLayoutHelper.Clamp(0, 2, config.ServerConfig.ForceRotorLibSimulation);
            motdTextBox.Text = string.Join(Environment.NewLine, config.ServerConfig.Motd ?? new System.Collections.Generic.List<string>());
            motdIntervalNumeric.Value = SettingsLayoutHelper.Clamp(1, 60, config.ServerConfig.MotdInterval);
            pidFileTextBox.Text = config.StartupParameters.PidFile ?? string.Empty;
            rankingTextBox.Text = config.StartupParameters.Ranking ?? string.Empty;
            disableVonCheckBox.Checked = config.ServerConfig.DisableVoN == 0;
            vonQualityNumeric.Value = SettingsLayoutHelper.Clamp(0, 30, config.ServerConfig.VonCodecQuality);
            vonCodecCombo.SelectedIndex = (int)SettingsLayoutHelper.Clamp(0, 1, config.ServerConfig.VonCodec);
            headlessListBox.Items.Clear();
            foreach (string item in config.ServerConfig.HeadlessClients)
            {
                headlessListBox.Items.Add(item);
            }

            localClientListBox.Items.Clear();
            foreach (string item in config.ServerConfig.LocalClient)
            {
                localClientListBox.Items.Add(item);
            }

            voteThresholdNumeric.Value = config.ServerConfig.VoteThreshold;
            votingTimeoutNumeric.Value = SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.VotingTimeOut);
            roleTimeoutNumeric.Value = SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.RoleTimeOut);
            briefingTimeoutNumeric.Value = SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.BriefingTimeOut);
            debriefingTimeoutNumeric.Value = SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.DebriefingTimeOut);
            lobbyIdleTimeoutNumeric.Value = SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.LobbyIdleTimeout);
            voteMissionPlayersNumeric.Value = SettingsLayoutHelper.Clamp(0, 99999, config.ServerConfig.VoteMissionPlayers);
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
            boundConfig.ServerConfig.HeadlessClients = headlessListBox.Items.Cast<string>().ToList();
            boundConfig.ServerConfig.LocalClient = localClientListBox.Items.Cast<string>().ToList();
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
            configNameTextBox = SettingsLayoutHelper.AddRow(layout, "配置名称", new TextBox { Dock = DockStyle.Fill });
            serverDirTextBox = new TextBox { ReadOnly = true, Width = 280 };
            var browseButton = new Button { Text = "浏览...", AutoSize = true };
            browseButton.Click += OnBrowseServerDir;
            var serverDirPanel = new FlowLayoutPanel { AutoSize = true };
            serverDirPanel.Controls.Add(serverDirTextBox);
            serverDirPanel.Controls.Add(browseButton);
            SettingsLayoutHelper.AddRow(layout, "服务器目录", serverDirPanel);
            hostNameTextBox = SettingsLayoutHelper.AddRow(layout, "服务器昵称", new TextBox { Dock = DockStyle.Fill });
            passwordTextBox = SettingsLayoutHelper.AddRow(layout, "服务器密码", new TextBox { Dock = DockStyle.Fill, UseSystemPasswordChar = true });
            maxPlayersNumeric = SettingsLayoutHelper.AddRow(layout, "最大人数", SettingsLayoutHelper.CreateNumeric(2, 200, 10, 120));
            portNumeric = SettingsLayoutHelper.AddRow(layout, "端口", SettingsLayoutHelper.CreateNumeric(1024, 65535, 2302, 120));
            x64CheckBox = SettingsLayoutHelper.AddRow(layout, "x64", new CheckBox { Text = "使用 arma3server_x64.exe", AutoSize = true, Checked = true });
            persistentCheckBox = SettingsLayoutHelper.AddRow(layout, "Persistent", new CheckBox { Text = "任务持久化", AutoSize = true });
            autoInitCheckBox = SettingsLayoutHelper.AddRow(layout, "AutoInit", new CheckBox { Text = "-autoInit", AutoSize = true });
            skipLobbyCheckBox = SettingsLayoutHelper.AddRow(layout, "SkipLobby", new CheckBox { Text = "跳过大厅", AutoSize = true });
            drawingInMapCheckBox = SettingsLayoutHelper.AddRow(layout, "DrawingInMap", new CheckBox { Text = "允许地图绘制", AutoSize = true, Checked = true });
            statisticsCheckBox = SettingsLayoutHelper.AddRow(layout, "Statistics", new CheckBox { Text = "启用官方统计", AutoSize = true });
            rotorLibCombo = SettingsLayoutHelper.AddRow(layout, "RotorLib", new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 200 });
            rotorLibCombo.Items.AddRange(new object[] { "玩家决定", "强制 AFM", "强制 SFM" });
            return layout;
        }

        private Control BuildMotdRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(120);
            motdTextBox = SettingsLayoutHelper.AddRow(layout, "MOTD", new TextBox { Multiline = true, Height = 70, Dock = DockStyle.Fill, ScrollBars = ScrollBars.Vertical });
            motdIntervalNumeric = SettingsLayoutHelper.AddRow(layout, "MOTD 间隔", SettingsLayoutHelper.CreateNumeric(1, 60, 1, 120));
            pidFileTextBox = SettingsLayoutHelper.AddRow(layout, "PID 文件", new TextBox { Dock = DockStyle.Fill });
            rankingTextBox = SettingsLayoutHelper.AddRow(layout, "Ranking", new TextBox { Dock = DockStyle.Fill });
            return layout;
        }

        private Control BuildVoiceRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(120);
            disableVonCheckBox = SettingsLayoutHelper.AddRow(layout, "VoN", new CheckBox { Text = "启用语音", AutoSize = true, Checked = true });
            vonQualityNumeric = SettingsLayoutHelper.AddRow(layout, "语音质量", SettingsLayoutHelper.CreateNumeric(0, 30, 30, 120));
            vonCodecCombo = SettingsLayoutHelper.AddRow(layout, "编码器", new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 200 });
            vonCodecCombo.Items.AddRange(new object[] { "SPEEX", "OPUS" });
            return layout;
        }

        private Control BuildHeadlessRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(120);
            headlessListBox = new ListBox { Height = 70, Dock = DockStyle.Fill };
            localClientListBox = new ListBox { Height = 70, Dock = DockStyle.Fill };
            var headlessPanel = CreateListPanel(headlessListBox, "127.0.0.1");
            var localPanel = CreateListPanel(localClientListBox, "127.0.0.1");
            SettingsLayoutHelper.AddRow(layout, "HeadlessClients", headlessPanel);
            SettingsLayoutHelper.AddRow(layout, "LocalClient", localPanel);
            return layout;
        }

        private Control BuildVoteRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(140);
            voteThresholdNumeric = SettingsLayoutHelper.AddRow(layout, "VoteThreshold", SettingsLayoutHelper.CreateNumeric(0, 100, 0, 120));
            votingTimeoutNumeric = SettingsLayoutHelper.AddRow(layout, "VotingTimeOut", SettingsLayoutHelper.CreateNumeric(0, 99999, 0, 120));
            roleTimeoutNumeric = SettingsLayoutHelper.AddRow(layout, "RoleTimeOut", SettingsLayoutHelper.CreateNumeric(0, 99999, 99999, 120));
            briefingTimeoutNumeric = SettingsLayoutHelper.AddRow(layout, "BriefingTimeOut", SettingsLayoutHelper.CreateNumeric(0, 99999, 60, 120));
            debriefingTimeoutNumeric = SettingsLayoutHelper.AddRow(layout, "DebriefingTimeOut", SettingsLayoutHelper.CreateNumeric(0, 99999, 45, 120));
            lobbyIdleTimeoutNumeric = SettingsLayoutHelper.AddRow(layout, "LobbyIdleTimeout", SettingsLayoutHelper.CreateNumeric(0, 99999, 99999, 120));
            voteMissionPlayersNumeric = SettingsLayoutHelper.AddRow(layout, "VoteMissionPlayers", SettingsLayoutHelper.CreateNumeric(0, 99999, 0, 120));
            return layout;
        }

        private Control BuildExtraArgsRows()
        {
            var layout = SettingsLayoutHelper.CreateFormLayout(140);
            serverCfgArgsTextBox = SettingsLayoutHelper.AddRow(layout, "server.cfg", new TextBox { Multiline = true, Height = 50, Dock = DockStyle.Fill, ScrollBars = ScrollBars.Vertical });
            basicCfgArgsTextBox = SettingsLayoutHelper.AddRow(layout, "basic.cfg", new TextBox { Multiline = true, Height = 50, Dock = DockStyle.Fill, ScrollBars = ScrollBars.Vertical });
            startArgsTextBox = SettingsLayoutHelper.AddRow(layout, "启动参数", new TextBox { Multiline = true, Height = 50, Dock = DockStyle.Fill, ScrollBars = ScrollBars.Vertical });
            profileArgsTextBox = SettingsLayoutHelper.AddRow(layout, "Profile", new TextBox { Multiline = true, Height = 50, Dock = DockStyle.Fill, ScrollBars = ScrollBars.Vertical });
            return layout;
        }

        private static GroupBox CreateGroup(string title, Control content)
        {
            content.Dock = DockStyle.Top;
            var group = new GroupBox
            {
                Text = title,
                Dock = DockStyle.Top,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Padding = new Padding(8),
                Margin = new Padding(0, 0, 0, 8),
            };
            group.Controls.Add(content);
            return group;
        }

        private static Control CreateListPanel(ListBox listBox, string defaultIp)
        {
            var addButton = new Button { Text = "添加", AutoSize = true };
            var removeButton = new Button { Text = "删除", AutoSize = true };
            addButton.Click += delegate
            {
                using (var prompt = new TextInputDialog("添加 IP", "输入 IP 地址", defaultIp))
                {
                    if (prompt.ShowDialog() == DialogResult.OK && !string.IsNullOrWhiteSpace(prompt.InputText))
                    {
                        string ip = prompt.InputText.Trim();
                        if (!IPv4Tools.ValidateIPAddress(ip))
                        {
                            MessageBox.Show("IP 地址格式无效。", "无效 IP", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                            return;
                        }

                        listBox.Items.Add(ip);
                    }
                }
            };
            removeButton.Click += delegate
            {
                if (listBox.SelectedItem != null)
                {
                    listBox.Items.Remove(listBox.SelectedItem);
                }
            };
            var panel = new TableLayoutPanel { ColumnCount = 2, Dock = DockStyle.Fill, AutoSize = true };
            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            panel.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 120));
            panel.Controls.Add(listBox, 0, 0);
            var buttons = new FlowLayoutPanel { FlowDirection = FlowDirection.TopDown, AutoSize = true, Dock = DockStyle.Fill };
            buttons.Controls.Add(addButton);
            buttons.Controls.Add(removeButton);
            panel.Controls.Add(buttons, 1, 0);
            return panel;
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
