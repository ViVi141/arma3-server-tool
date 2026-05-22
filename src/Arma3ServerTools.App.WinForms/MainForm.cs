using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms
{
    internal sealed class MainForm : Form
    {
        private readonly AppServices services = AppServices.Instance;
        private readonly DataGridView serverGrid;
        private readonly ServerSettingsHost settingsHost;
        private readonly ToolStripStatusLabel statusServerLabel;
        private readonly ToolStripStatusLabel statusSaveLabel;
        private readonly ToolStripButton startButton;
        private readonly ToolStripButton stopButton;
        private readonly ToolStripButton saveButton;
        private readonly ToolStripButton writeCfgButton;

        public MainForm()
        {
            Text = "Arma3 Server Tools";
            Width = 1100;
            Height = 720;
            StartPosition = FormStartPosition.CenterScreen;
            MinimumSize = new Size(900, 600);

            var menuStrip = new MenuStrip();
            var fileMenu = new ToolStripMenuItem("文件");
            fileMenu.DropDownItems.Add("退出", null, delegate { Close(); });
            var serverMenu = new ToolStripMenuItem("服务器");
            serverMenu.DropDownItems.Add("新建...", null, OnNewServer);
            serverMenu.DropDownItems.Add("删除", null, OnDeleteServer);
            serverMenu.DropDownItems.Add("刷新列表", null, delegate { ReloadServers(); });
            serverMenu.DropDownItems.Add(new ToolStripSeparator());
            serverMenu.DropDownItems.Add("打开配置目录", null, OnOpenConfigDirectory);
            serverMenu.DropDownItems.Add("打开 destiny 配置", null, OnOpenDestinyConfigDirectory);
            serverMenu.DropDownItems.Add("安装/更新专用服务器...", null, OnInstallDedicatedServer);

            var toolsMenu = new ToolStripMenuItem("工具");
            toolsMenu.DropDownItems.Add("SteamCMD 设置...", null, OnSteamCmdSettings);

            menuStrip.Items.Add(fileMenu);
            menuStrip.Items.Add(serverMenu);
            menuStrip.Items.Add(toolsMenu);
            MainMenuStrip = menuStrip;

            var toolStrip = new ToolStrip();
            startButton = new ToolStripButton("启动") { DisplayStyle = ToolStripItemDisplayStyle.Text };
            stopButton = new ToolStripButton("停止") { DisplayStyle = ToolStripItemDisplayStyle.Text };
            saveButton = new ToolStripButton("保存配置") { DisplayStyle = ToolStripItemDisplayStyle.Text };
            writeCfgButton = new ToolStripButton("写入 cfg") { DisplayStyle = ToolStripItemDisplayStyle.Text };
            startButton.Click += OnStartServer;
            stopButton.Click += OnStopServer;
            saveButton.Click += OnSaveConfig;
            writeCfgButton.Click += OnWriteCfg;
            toolStrip.Items.Add(startButton);
            toolStrip.Items.Add(stopButton);
            toolStrip.Items.Add(new ToolStripSeparator());
            toolStrip.Items.Add(saveButton);
            toolStrip.Items.Add(writeCfgButton);

            serverGrid = new DataGridView
            {
                Dock = DockStyle.Fill,
                ReadOnly = true,
                AllowUserToAddRows = false,
                AllowUserToDeleteRows = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                MultiSelect = false,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            };
            serverGrid.Columns.Add("ConfigName", "配置名");
            serverGrid.Columns.Add("ServerUuid", "UUID");
            serverGrid.Columns.Add("SaveTime", "最后保存");
            serverGrid.Columns.Add("State", "状态");
            serverGrid.SelectionChanged += OnServerSelectionChanged;

            settingsHost = new ServerSettingsHost();

            var split = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Vertical,
                SplitterDistance = 380,
            };
            split.Panel1.Controls.Add(serverGrid);
            split.Panel2.Controls.Add(settingsHost);

            var statusStrip = new StatusStrip();
            statusServerLabel = new ToolStripStatusLabel("当前服务器: （未选择）");
            statusSaveLabel = new ToolStripStatusLabel(" ");
            statusStrip.Items.Add(statusServerLabel);
            statusStrip.Items.Add(new ToolStripStatusLabel { Spring = true });
            statusStrip.Items.Add(statusSaveLabel);

            Controls.Add(split);
            Controls.Add(toolStrip);
            Controls.Add(menuStrip);
            Controls.Add(statusStrip);

            Load += OnMainFormLoad;
            FormClosed += OnMainFormClosed;
        }

        private void OnMainFormClosed(object sender, FormClosedEventArgs e)
        {
            try
            {
                services.SchedulerService.StopAsync().GetAwaiter().GetResult();
            }
            catch
            {
            }

            MonitoringHostLauncher.StopStartedHost();
        }

        private void OnMainFormLoad(object sender, EventArgs e)
        {
            EnsureConfigDirectory();
            StartMonitoringHost();
            ReloadServers();
        }

        private void EnsureConfigDirectory()
        {
            Directory.CreateDirectory(services.Paths.ConfigDirectory);
        }

        private void StartMonitoringHost()
        {
            string message;
            if (!MonitoringHostLauncher.TryStart(AppDomain.CurrentDomain.SetupInformation.ApplicationBase, out message))
            {
                if (!string.IsNullOrEmpty(message))
                {
                    statusSaveLabel.Text = message;
                    if (message.StartsWith("启动监控宿主失败", StringComparison.Ordinal))
                    {
                        MessageBox.Show(message, "警告", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                }
            }
        }

        private void ReloadServers()
        {
            serverGrid.Rows.Clear();
            services.LoadedConfigs.Clear();
            foreach (var pair in services.ConfigService.List())
            {
                try
                {
                    ArmaServerConfig config = services.ConfigService.Get(pair.ServerUuid);
                    services.LoadedConfigs[config.ServerUUID] = config;
                    string state = services.ProcessService.GetState(config.ServerUUID).ToString();
                    serverGrid.Rows.Add(config.ConfigName, config.ServerUUID, config.SaveTime, state);
                }
                catch (Exception ex)
                {
                    MessageBox.Show("读取配置失败 [" + pair.FileName + "]: " + ex.Message, "错误", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }

            if (serverGrid.Rows.Count > 0)
            {
                serverGrid.Rows[0].Selected = true;
            }
            else
            {
                services.CurrentServerUuid = null;
                settingsHost.Bind(null);
                UpdateStatusBar(null);
            }
        }

        private void OnServerSelectionChanged(object sender, EventArgs e)
        {
            if (serverGrid.SelectedRows.Count == 0)
            {
                return;
            }

            string uuid = Convert.ToString(serverGrid.SelectedRows[0].Cells["ServerUuid"].Value);
            services.CurrentServerUuid = uuid;
            settingsHost.Bind(services.GetCurrentConfig());
            UpdateStatusBar(services.GetCurrentConfig());
        }

        private void OnNewServer(object sender, EventArgs e)
        {
            using (var dialog = new NewServerDialog())
            {
                if (dialog.ShowDialog(this) != DialogResult.OK)
                {
                    return;
                }

                ArmaServerConfig config = services.ConfigService.Create(dialog.ConfigName, dialog.ServerDirectory);
                services.LoadedConfigs[config.ServerUUID] = config;
                services.CurrentServerUuid = config.ServerUUID;
                ReloadServers();
                SelectServer(config.ServerUUID);
            }
        }

        private void OnDeleteServer(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            DialogResult confirm = MessageBox.Show(
                "确定删除配置 \"" + config.ConfigName + "\" 吗？（仅删除 json，不删除服务器文件）",
                "确认",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Question);
            if (confirm != DialogResult.Yes)
            {
                return;
            }

            services.ConfigService.Delete(config.ServerUUID);
            services.LoadedConfigs.Remove(config.ServerUUID);
            ReloadServers();
        }

        private void ApplyCurrentSettings()
        {
            settingsHost.ApplyAll();
        }

        private void OnSaveConfig(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            ApplyCurrentSettings();
            config.SetTime();
            services.ConfigService.Save(config);
            SyncSchedulerJobs(config);
            UpdateStatusBar(config);
            RefreshSelectedRowState();
            MessageBox.Show("配置已保存。", "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void OnWriteCfg(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            ApplyCurrentSettings();
            config.SetTime();
            services.ConfigService.Save(config);
            SyncSchedulerJobs(config);
            OperationResult result = services.ConfigWriter.WriteAll(config);
            if (result.Success)
            {
                MessageBox.Show("server.cfg / basic.cfg / BE 配置已写入。", "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show(result.Message, "失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OnStartServer(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            ApplyCurrentSettings();
            config.SetTime();
            services.ConfigService.Save(config);
            SyncSchedulerJobs(config);
            OperationResult result = services.ProcessService.Start(config.ServerUUID);
            if (result.Success)
            {
                if (config.ServerTaskManagement.EnableMonitoringService)
                {
                    try
                    {
                        services.MonitoringQueryService.InitPlayerOnlineInfo(config.ServerUUID);
                    }
                    catch
                    {
                    }
                }

                MessageBox.Show("服务器启动命令已执行。", "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show(result.Message, "启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }

            RefreshSelectedRowState();
        }

        private void OnStopServer(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            OperationResult result = services.ProcessService.Stop(config.ServerUUID);
            if (!result.Success)
            {
                MessageBox.Show(result.Message, "停止失败", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }

            RefreshSelectedRowState();
        }

        private void SyncSchedulerJobs(ArmaServerConfig config)
        {
            try
            {
                services.SchedulerService
                    .SyncJobsAsync(config.ServerUUID, config.ServerTaskManagement.CronEntity)
                    .GetAwaiter()
                    .GetResult();
            }
            catch (Exception ex)
            {
                MessageBox.Show("定时任务同步失败: " + ex.Message, "警告", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void OnSteamCmdSettings(object sender, EventArgs e)
        {
            using (var dialog = new SteamCmdConfigForm(services.GetSteamCmdSettings()))
            {
                if (dialog.ShowDialog(this) != DialogResult.OK)
                {
                    return;
                }

                OperationResult validation = dialog.ValidateSettings();
                if (!validation.Success)
                {
                    MessageBox.Show(validation.Message, "失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                services.SaveSteamCmdSettings(dialog.BuildSettings());
                MessageBox.Show("SteamCMD 配置已保存。", "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private void OnInstallDedicatedServer(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            SteamcmdEntity settings = services.GetSteamCmdSettings();
            string installDir = config != null && !string.IsNullOrEmpty(config.ServerDir)
                ? config.ServerDir
                : settings.i;
            if (string.IsNullOrEmpty(installDir))
            {
                MessageBox.Show("请先配置 SteamCMD 或选择服务器的安装目录。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            if (!SteamCmdUiHelper.EnsureSteamCmdAvailable(this, services.SteamCmdService))
            {
                return;
            }

            OperationResult result = services.SteamCmdService.InstallDedicatedServer(installDir);
            if (result.Success)
            {
                MessageBox.Show(result.Message, "成功", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show(result.Message, "失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OnOpenConfigDirectory(object sender, EventArgs e)
        {
            Directory.CreateDirectory(services.Paths.ConfigDirectory);
            Process.Start(new ProcessStartInfo
            {
                FileName = services.Paths.ConfigDirectory,
                UseShellExecute = true,
            });
        }

        private void OnOpenDestinyConfigDirectory(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null || string.IsNullOrEmpty(config.ServerDir) || string.IsNullOrEmpty(config.ServerUUID))
            {
                MessageBox.Show("请先选择服务器。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            string path = Path.Combine(config.ServerDir, "destiny_serverconfig", config.ServerUUID);
            Directory.CreateDirectory(path);
            Process.Start(new ProcessStartInfo
            {
                FileName = path,
                UseShellExecute = true,
            });
        }

        private void SelectServer(string uuid)
        {
            for (int i = 0; i < serverGrid.Rows.Count; i++)
            {
                if (Convert.ToString(serverGrid.Rows[i].Cells["ServerUuid"].Value) == uuid)
                {
                    serverGrid.Rows[i].Selected = true;
                    break;
                }
            }
        }

        private void RefreshSelectedRowState()
        {
            if (serverGrid.SelectedRows.Count == 0 || string.IsNullOrEmpty(services.CurrentServerUuid))
            {
                return;
            }

            serverGrid.SelectedRows[0].Cells["State"].Value = services.ProcessService.GetState(services.CurrentServerUuid).ToString();
            serverGrid.SelectedRows[0].Cells["SaveTime"].Value = services.GetCurrentConfig().SaveTime;
        }

        private void UpdateStatusBar(ArmaServerConfig config)
        {
            if (config == null)
            {
                statusServerLabel.Text = "当前服务器: （未选择）";
                statusSaveLabel.Text = string.Empty;
                return;
            }

            statusServerLabel.Text = "当前服务器: " + config.ConfigName + " (" + config.ServerUUID + ")";
            statusSaveLabel.Text = config.SaveTime;
        }
    }

    internal sealed class NewServerDialog : Form
    {
        private readonly TextBox nameTextBox;
        private readonly TextBox dirTextBox;

        public NewServerDialog()
        {
            Text = "新建服务器配置";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            ClientSize = new Size(480, 160);

            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 2,
                RowCount = 3,
                Padding = new Padding(12),
            };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

            nameTextBox = new TextBox { Dock = DockStyle.Fill, Text = "新服务器" };
            dirTextBox = new TextBox { Dock = DockStyle.Fill };
            var browseButton = new Button { Text = "浏览...", AutoSize = true };
            browseButton.Click += delegate
            {
                using (var folderDialog = new FolderBrowserDialog())
                {
                    if (folderDialog.ShowDialog(this) == DialogResult.OK)
                    {
                        dirTextBox.Text = folderDialog.SelectedPath;
                    }
                }
            };

            layout.Controls.Add(new Label { Text = "配置名称", AutoSize = true }, 0, 0);
            layout.Controls.Add(nameTextBox, 1, 0);
            layout.Controls.Add(new Label { Text = "服务器目录", AutoSize = true }, 0, 1);
            var dirPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            dirPanel.Controls.Add(dirTextBox);
            dirPanel.Controls.Add(browseButton);
            layout.Controls.Add(dirPanel, 1, 1);

            var okButton = new Button { Text = "确定", DialogResult = DialogResult.OK, Width = 80 };
            var cancelButton = new Button { Text = "取消", DialogResult = DialogResult.Cancel, Width = 80 };
            var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, AutoSize = true };
            buttons.Controls.Add(cancelButton);
            buttons.Controls.Add(okButton);
            layout.Controls.Add(buttons, 1, 2);
            AcceptButton = okButton;
            CancelButton = cancelButton;
            Controls.Add(layout);
        }

        public string ConfigName
        {
            get { return nameTextBox.Text.Trim(); }
        }

        public string ServerDirectory
        {
            get { return dirTextBox.Text.Trim(); }
        }
    }
}
