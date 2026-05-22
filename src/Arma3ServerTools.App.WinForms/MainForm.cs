using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using AntButton = AntdUI.Button;
using AntDropdown = AntdUI.Dropdown;
using AntInput = AntdUI.Input;
using AntLabel = AntdUI.Label;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms
{
    internal sealed class MainForm : AntdUI.Window
    {
        private readonly AppServices services = AppServices.Instance;
        private readonly AntdUI.PageHeader pageHeader;
        private readonly AntTable serverTable;
        private readonly AntInput serverSearchInput;
        private readonly ServerSettingsHost settingsHost;
        private readonly AntLabel statusServerLabel;
        private readonly AntLabel statusSaveLabel;
        private readonly AntButton startButton;
        private readonly AntButton stopButton;
        private readonly AntButton saveButton;
        private readonly AntButton writeCfgButton;
        private readonly SplitContainer split;
        private readonly List<ServerGridRow> serverRows = new List<ServerGridRow>();
        private string serverSearchFilter = string.Empty;
        private readonly System.Windows.Forms.Timer statePollTimer;
        private readonly NotifyIcon trayNotifyIcon;
        private bool suppressStopNotification;
        private bool suppressTableSelectionEvent;

        public MainForm()
        {
            Text = UiLabels.AppTitle;
            ClientSize = UiScaleHelper.ScaleSize(1100, 720);
            MinimumSize = UiScaleHelper.ScaleSize(900, 600);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.White;
            MaximizeBox = true;
            MinimizeBox = true;

            pageHeader = new AntdUI.PageHeader
            {
                Text = UiLabels.AppTitle,
                SubText = string.Empty,
                ShowButton = true,
                ShowIcon = false,
                MaximizeBox = true,
                MinimizeBox = true,
                FullBox = false,
                CancelButton = true,
                MDI = true,
                DragMove = true,
                EnableDoubleClickMaximize = true,
                DividerShow = true,
                UseTitleFont = true,
                UseTextBold = true,
                UseLeftMargin = true,
                CloseSize = UiScaleHelper.Scale(48),
            };

            startButton = CreateActionButton("启动", AntdUI.TTypeMini.Primary);
            stopButton = CreateActionButton("停止", AntdUI.TTypeMini.Default);
            saveButton = CreateActionButton("保存配置", AntdUI.TTypeMini.Default);
            writeCfgButton = CreateActionButton(UiLabels.WriteConfigFiles, AntdUI.TTypeMini.Default);
            startButton.Click += OnStartServer;
            stopButton.Click += OnStopServer;
            saveButton.Click += OnSaveConfig;
            writeCfgButton.Click += OnWriteCfg;

            statusServerLabel = new AntLabel
            {
                Dock = DockStyle.Left,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Text = "当前服务器: （未选择）",
            };
            statusSaveLabel = new AntLabel
            {
                Dock = DockStyle.Right,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Text = string.Empty,
            };

            Control actionBar = BuildActionBar();
            Control topChrome = BuildTopChrome(actionBar);
            serverTable = CreateServerTable();
            serverSearchInput = CreateServerSearchInput();
            settingsHost = new ServerSettingsHost();

            var serverListHost = new Panel
            {
                Dock = DockStyle.Fill,
            };
            serverTable.Dock = DockStyle.Fill;
            serverSearchInput.Dock = DockStyle.Top;
            serverListHost.Controls.Add(serverTable);
            serverListHost.Controls.Add(serverSearchInput);

            split = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Vertical,
            };
            split.Panel1.Padding = UiScaleHelper.ScalePadding(8);
            split.Panel2.Padding = UiScaleHelper.ScalePadding(8);
            split.Panel1.Controls.Add(serverListHost);
            split.Panel2.Controls.Add(settingsHost);
            SplitContainerHelper.BindProportionalSplit(split, 0.34, false, 240, 420);

            Control statusPanel = BuildStatusPanel();

            Controls.Add(split);
            Controls.Add(statusPanel);
            Controls.Add(topChrome);

            Load += OnMainFormLoad;
            FormClosed += OnMainFormClosed;
            Resize += OnMainFormResize;

            statePollTimer = new System.Windows.Forms.Timer();
            statePollTimer.Interval = 3000;
            statePollTimer.Tick += OnStatePollTimerTick;

            trayNotifyIcon = new NotifyIcon
            {
                Visible = false,
                Text = UiLabels.AppTitle,
            };
            if (Icon != null)
            {
                trayNotifyIcon.Icon = Icon;
            }
        }

        private Control BuildTopChrome(Control actionBar)
        {
            int headerHeight = UiScaleHelper.Scale(40);
            int barHeight = UiScaleHelper.Scale(46);

            pageHeader.Dock = DockStyle.Fill;

            actionBar.Dock = DockStyle.Fill;

            var chrome = new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                ColumnCount = 1,
                RowCount = 2,
                Height = headerHeight + barHeight,
                Padding = new Padding(0),
                Margin = new Padding(0),
            };
            chrome.RowStyles.Add(new RowStyle(SizeType.Absolute, headerHeight));
            chrome.RowStyles.Add(new RowStyle(SizeType.Absolute, barHeight));
            chrome.Controls.Add(pageHeader, 0, 0);
            chrome.Controls.Add(actionBar, 0, 1);
            return chrome;
        }

        private Control BuildActionBar()
        {
            var panel = new AntdUI.Panel
            {
                Height = UiScaleHelper.Scale(46),
                Padding = new Padding(UiScaleHelper.Scale(12), UiScaleHelper.Scale(6), UiScaleHelper.Scale(12), UiScaleHelper.Scale(6)),
                BackColor = Color.FromArgb(245, 247, 250),
            };

            var rightLayout = new FlowLayoutPanel
            {
                Dock = DockStyle.Right,
                AutoSize = true,
                WrapContents = false,
                FlowDirection = FlowDirection.LeftToRight,
                Padding = new Padding(0),
            };
            rightLayout.Controls.Add(CreateToolsMenuButton());
            rightLayout.Controls.Add(CreateServerMenuButton());

            var leftLayout = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                WrapContents = false,
                AutoScroll = true,
                Padding = new Padding(0),
            };
            leftLayout.Controls.Add(startButton);
            leftLayout.Controls.Add(stopButton);
            leftLayout.Controls.Add(CreateDivider());
            leftLayout.Controls.Add(saveButton);
            leftLayout.Controls.Add(writeCfgButton);

            panel.Controls.Add(rightLayout);
            panel.Controls.Add(leftLayout);
            return panel;
        }

        private AntDropdown CreateServerMenuButton()
        {
            var dropdown = new AntDropdown
            {
                Text = "服务器",
                Type = AntdUI.TTypeMini.Default,
            };
            dropdown.Items.AddRange(new object[]
            {
                new AntdUI.SelectItem("new", "新建..."),
                new AntdUI.SelectItem("copy", "复制为新建..."),
                new AntdUI.SelectItem("delete", "删除"),
                new AntdUI.SelectItem("refresh", "刷新列表"),
                new AntdUI.SelectItem("sep1", "-"),
                new AntdUI.SelectItem("openConfig", "打开配置目录"),
                new AntdUI.SelectItem("openDestiny", "打开 destiny 配置"),
                new AntdUI.SelectItem("installServer", "安装/更新专用服务器..."),
            });
            dropdown.ItemClick += delegate(object sender, AntdUI.ObjectNEventArgs e)
            {
                string id = Convert.ToString(e.Value);
                if (id == "new")
                {
                    OnNewServer(sender, EventArgs.Empty);
                }
                else if (id == "copy")
                {
                    OnCopyServer(sender, EventArgs.Empty);
                }
                else if (id == "delete")
                {
                    OnDeleteServer(sender, EventArgs.Empty);
                }
                else if (id == "refresh")
                {
                    ReloadServers();
                }
                else if (id == "openConfig")
                {
                    OnOpenConfigDirectory(sender, EventArgs.Empty);
                }
                else if (id == "openDestiny")
                {
                    OnOpenDestinyConfigDirectory(sender, EventArgs.Empty);
                }
                else if (id == "installServer")
                {
                    OnInstallDedicatedServer(sender, EventArgs.Empty);
                }
            };
            return dropdown;
        }

        private AntDropdown CreateToolsMenuButton()
        {
            var dropdown = new AntDropdown
            {
                Text = "工具",
                Type = AntdUI.TTypeMini.Default,
            };
            dropdown.Items.Add(new AntdUI.SelectItem("quickSetup", "快速配置向导..."));
            dropdown.Items.Add(new AntdUI.SelectItem("steamcmd", "SteamCMD 设置..."));
            dropdown.Items.Add(new AntdUI.SelectItem("about", "关于..."));
            dropdown.ItemClick += delegate(object sender, AntdUI.ObjectNEventArgs e)
            {
                string id = Convert.ToString(e.Value);
                if (id == "quickSetup")
                {
                    OnQuickSetupWizard(sender, EventArgs.Empty);
                }
                else if (id == "steamcmd")
                {
                    OnSteamCmdSettings(sender, EventArgs.Empty);
                }
                else if (id == "about")
                {
                    OnAbout(sender, EventArgs.Empty);
                }
            };
            return dropdown;
        }

        private static AntButton CreateActionButton(string text, AntdUI.TTypeMini type)
        {
            return new AntButton
            {
                Text = text,
                Type = type,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Margin = new Padding(0, 0, UiScaleHelper.Scale(8), 0),
            };
        }

        private static Control CreateDivider()
        {
            return new AntdUI.Divider
            {
                Vertical = true,
                Margin = new Padding(UiScaleHelper.Scale(4), UiScaleHelper.Scale(4), UiScaleHelper.Scale(12), UiScaleHelper.Scale(4)),
            };
        }

        private AntTable CreateServerTable()
        {
            var table = new AntTable
            {
                Dock = DockStyle.Fill,
                Bordered = true,
                Radius = UiScaleHelper.Scale(6),
                FixedHeader = true,
                VisibleHeader = true,
                AutoSizeColumnsMode = AntdUI.ColumnsMode.Fill,
                RowHeight = UiScaleHelper.Scale(34),
                RowHeightHeader = UiScaleHelper.Scale(36),
                Gap = UiScaleHelper.Scale(8),
            };
            table.Columns = new AntdUI.ColumnCollection
            {
                new AntdUI.Column("ConfigName", "配置名") { Width = "34%" },
                new AntdUI.Column("ServerUuid", UiLabels.ServerId) { Width = "34%" },
                new AntdUI.Column("SaveTime", "最后保存") { Width = "18%" },
                new AntdUI.Column("State", "状态") { Width = "14%", Align = AntdUI.ColumnAlign.Center },
            };
            table.SelectIndexChanged += OnServerTableSelectionChanged;
            return table;
        }

        private AntInput CreateServerSearchInput()
        {
            var input = new AntInput
            {
                PlaceholderText = "搜索配置名或 UUID...",
                Margin = new Padding(0, 0, 0, UiScaleHelper.Scale(6)),
            };
            input.TextChanged += OnServerSearchTextChanged;
            return input;
        }

        private void OnServerSearchTextChanged(object sender, EventArgs e)
        {
            serverSearchFilter = serverSearchInput.Text.Trim();
            string previousUuid = services.CurrentServerUuid;
            BindServerTable();
            RestoreServerSelection(previousUuid);
        }

        private IReadOnlyList<ServerGridRow> GetFilteredServerRows()
        {
            if (string.IsNullOrWhiteSpace(serverSearchFilter))
            {
                return serverRows;
            }

            string filter = serverSearchFilter;
            var filtered = new List<ServerGridRow>();
            for (int i = 0; i < serverRows.Count; i++)
            {
                ServerGridRow row = serverRows[i];
                if (RowMatchesSearch(row, filter))
                {
                    filtered.Add(row);
                }
            }

            return filtered;
        }

        private static bool RowMatchesSearch(ServerGridRow row, string filter)
        {
            if (row.ConfigName != null
                && row.ConfigName.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            if (row.ServerUuid != null
                && row.ServerUuid.IndexOf(filter, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            return false;
        }

        private Control BuildStatusPanel()
        {
            var panel = new AntdUI.Panel
            {
                Dock = DockStyle.Bottom,
                Height = UiScaleHelper.Scale(34),
                Padding = new Padding(UiScaleHelper.Scale(12), UiScaleHelper.Scale(6), UiScaleHelper.Scale(12), UiScaleHelper.Scale(6)),
                BackColor = Color.FromArgb(250, 250, 250),
            };

            panel.Controls.Add(statusSaveLabel);
            panel.Controls.Add(statusServerLabel);
            return panel;
        }

        private void OnMainFormResize(object sender, EventArgs e)
        {
            if (split.Width > 0 && split.Tag == null)
            {
                SplitContainerHelper.ApplyInitialDistance(split, 0.34, false);
            }
        }

        private void OnMainFormClosed(object sender, FormClosedEventArgs e)
        {
            statePollTimer.Stop();
            statePollTimer.Dispose();
            if (trayNotifyIcon != null)
            {
                trayNotifyIcon.Visible = false;
                trayNotifyIcon.Dispose();
            }

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
            ConfigurePageHeaderIcon();
            EnsureConfigDirectory();
            StartMonitoringHost();
            ReloadServers();
            statePollTimer.Start();
        }

        private void ConfigurePageHeaderIcon()
        {
            if (Icon == null)
            {
                return;
            }

            pageHeader.ShowIcon = true;
            pageHeader.Icon = Icon.ToBitmap();
            if (trayNotifyIcon != null && Icon != null)
            {
                trayNotifyIcon.Icon = Icon;
            }
        }

        private void EnsureConfigDirectory()
        {
            Directory.CreateDirectory(services.Paths.ConfigDirectory);
        }

        private void StartMonitoringHost()
        {
            string message;
            if (!MonitoringHostLauncher.TryStart(AppContext.BaseDirectory, out message))
            {
                if (!string.IsNullOrEmpty(message))
                {
                    statusSaveLabel.Text = message;
                    if (message.StartsWith("启动监控宿主失败", StringComparison.Ordinal))
                    {
                        AntdUiHelper.ShowWarning(this, message, "警告");
                    }
                }
            }
        }

        private void ReloadServers()
        {
            string previousUuid = services.CurrentServerUuid;
            serverRows.Clear();
            services.LoadedConfigs.Clear();
            foreach (var pair in services.ConfigService.List())
            {
                try
                {
                    ArmaServerConfig config = services.ConfigService.Get(pair.ServerUuid);
                    services.LoadedConfigs[config.ServerUUID] = config;
                    int pidBeforeSync = config.ServerTaskManagement.ProcessById;
                    ServerRunState runState = services.ProcessService.SyncState(config.ServerUUID);
                    RefreshCachedConfig(config.ServerUUID);
                    if (pidBeforeSync > 0 && runState == ServerRunState.Stopped)
                    {
                        ResetMonitoringOnlineIfEnabled(services.LoadedConfigs[config.ServerUUID]);
                    }

                    serverRows.Add(new ServerGridRow
                    {
                        ConfigName = config.ConfigName,
                        ServerUuid = config.ServerUUID,
                        SaveTime = config.SaveTime,
                        RunState = runState,
                    });
                }
                catch (Exception ex)
                {
                    AntdUiHelper.ShowError(this, "读取配置失败 [" + pair.FileName + "]: " + ex.Message, "错误");
                }
            }

            BindServerTable();
            RestoreServerSelection(previousUuid);
        }

        private void BindServerTable()
        {
            suppressTableSelectionEvent = true;
            try
            {
                IReadOnlyList<ServerGridRow> visibleRows = GetFilteredServerRows();
                serverTable.DataSource = visibleRows.ToArray();
                serverTable.Refresh();
            }
            finally
            {
                suppressTableSelectionEvent = false;
            }
        }

        private void RestoreServerSelection(string uuid)
        {
            IReadOnlyList<ServerGridRow> visibleRows = GetFilteredServerRows();
            if (!string.IsNullOrEmpty(uuid))
            {
                for (int i = 0; i < visibleRows.Count; i++)
                {
                    if (visibleRows[i].ServerUuid == uuid)
                    {
                        serverTable.SelectedIndex = i + 1;
                        ApplySelectedServer(visibleRows[i]);
                        return;
                    }
                }
            }

            if (visibleRows.Count > 0)
            {
                serverTable.SelectedIndex = 1;
                ApplySelectedServer(visibleRows[0]);
            }
            else
            {
                serverTable.SelectedIndex = 0;
                services.CurrentServerUuid = null;
                settingsHost.Bind(null);
                UpdateStatusBar(null);
            }
        }

        private void OnServerTableSelectionChanged(object sender, EventArgs e)
        {
            if (suppressTableSelectionEvent || serverTable.SelectedIndex <= 0)
            {
                return;
            }

            int rowIndex = serverTable.SelectedIndex - 1;
            IReadOnlyList<ServerGridRow> visibleRows = GetFilteredServerRows();
            if (rowIndex < 0 || rowIndex >= visibleRows.Count)
            {
                return;
            }

            ApplySelectedServer(visibleRows[rowIndex]);
        }

        private void ApplySelectedServer(ServerGridRow row)
        {
            services.CurrentServerUuid = row.ServerUuid;
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

        private void OnCopyServer(object sender, EventArgs e)
        {
            ArmaServerConfig source = services.GetCurrentConfig();
            if (source == null)
            {
                AntdUiHelper.ShowInfo(this, "请先选择要复制的服务器配置。", "提示");
                return;
            }

            using (var dialog = new CloneServerDialog(source))
            {
                if (dialog.ShowDialog(this) != DialogResult.OK)
                {
                    return;
                }

                ArmaServerConfig config = services.ConfigService.Clone(
                    source.ServerUUID,
                    dialog.ConfigName,
                    dialog.ServerDirectory);
                services.LoadedConfigs[config.ServerUUID] = config;
                services.CurrentServerUuid = config.ServerUUID;
                ReloadServers();
                SelectServer(config.ServerUUID);
                AntdUiHelper.ShowInfo(this, "已复制配置，请检查服务器目录与端口设置。", "完成");
            }
        }

        private void OnAbout(object sender, EventArgs e)
        {
            using (var dialog = new AboutForm())
            {
                dialog.ShowDialog(this);
            }
        }

        private void OnDeleteServer(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            if (!AntdUiHelper.Confirm(
                this,
                "确认",
                "确定删除配置 \"" + config.ConfigName + "\" 吗？（仅删除 json，不删除服务器文件）"))
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
            AntdUiHelper.ShowInfo(this, "配置已保存。", "成功");
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
                AntdUiHelper.ShowInfo(this, UiLabels.ConfigSavedHint, "成功");
            }
            else
            {
                AntdUiHelper.ShowError(this, result.Message, "失败");
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

            ServerRunState runState = services.ProcessService.GetState(config.ServerUUID);
            IReadOnlyList<PreflightCheckItem> preflightItems =
                services.PreflightChecker.Check(config, runState);
            if (services.PreflightChecker.HasBlockingErrors(preflightItems))
            {
                using (var dialog = new PreflightReportForm(preflightItems, false))
                {
                    dialog.ShowDialog(this);
                }

                return;
            }

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

                AntdUiHelper.ShowInfo(this, "服务器启动命令已执行。", "成功");
            }
            else
            {
                AntdUiHelper.ShowError(this, result.Message, "启动失败");
            }

            RefreshSelectedRowState();
        }

        private void OnQuickSetupWizard(object sender, EventArgs e)
        {
            using (var dialog = new QuickSetupWizardForm())
            {
                if (dialog.ShowDialog(this) != DialogResult.OK || dialog.CreatedConfig == null)
                {
                    return;
                }

                ArmaServerConfig config = dialog.CreatedConfig;
                services.LoadedConfigs[config.ServerUUID] = config;
                services.CurrentServerUuid = config.ServerUUID;
                ReloadServers();
                SelectServer(config.ServerUUID);
            }
        }

        private void OnStopServer(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            suppressStopNotification = true;
            OperationResult result = services.ProcessService.Stop(config.ServerUUID);
            if (!result.Success)
            {
                AntdUiHelper.ShowWarning(this, result.Message, "停止失败");
            }
            else
            {
                ResetMonitoringOnlineIfEnabled(config);
                RefreshCachedConfig(config.ServerUUID);
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
                AntdUiHelper.ShowWarning(this, "定时任务同步失败: " + ex.Message, "警告");
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
                    AntdUiHelper.ShowError(this, validation.Message, "失败");
                    return;
                }

                services.SaveSteamCmdSettings(dialog.BuildSettings());
                AntdUiHelper.ShowInfo(this, "SteamCMD 配置已保存。", "成功");
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
                AntdUiHelper.ShowWarning(this, "请先配置 SteamCMD 或选择服务器的安装目录。", "提示");
                return;
            }

            if (!SteamCmdUiHelper.EnsureSteamCmdAvailable(this, services.SteamCmdService))
            {
                return;
            }

            OperationResult result = services.SteamCmdService.InstallDedicatedServer(installDir);
            if (result.Success)
            {
                AntdUiHelper.ShowInfo(this, result.Message, "成功");
            }
            else
            {
                AntdUiHelper.ShowError(this, result.Message, "失败");
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
                AntdUiHelper.ShowInfo(this, "请先选择服务器。", "提示");
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
            IReadOnlyList<ServerGridRow> visibleRows = GetFilteredServerRows();
            for (int i = 0; i < visibleRows.Count; i++)
            {
                if (visibleRows[i].ServerUuid == uuid)
                {
                    serverTable.SelectedIndex = i + 1;
                    ApplySelectedServer(visibleRows[i]);
                    return;
                }
            }
        }

        private void RefreshSelectedRowState()
        {
            if (string.IsNullOrEmpty(services.CurrentServerUuid))
            {
                return;
            }

            for (int i = 0; i < serverRows.Count; i++)
            {
                if (serverRows[i].ServerUuid != services.CurrentServerUuid)
                {
                    continue;
                }

                ServerRunState runState = services.ProcessService.SyncState(services.CurrentServerUuid);
                RefreshCachedConfig(services.CurrentServerUuid);
                serverRows[i].RunState = runState;
                ArmaServerConfig config = services.GetCurrentConfig();
                if (config != null)
                {
                    serverRows[i].SaveTime = config.SaveTime;
                }

                BindServerTable();
                SelectServer(services.CurrentServerUuid);
                settingsHost.RefreshOverview();
                return;
            }
        }

        private void OnStatePollTimerTick(object sender, EventArgs e)
        {
            PollAllServerStates();
        }

        private void PollAllServerStates()
        {
            if (serverRows.Count == 0)
            {
                return;
            }

            bool stateChanged = false;
            for (int i = 0; i < serverRows.Count; i++)
            {
                ServerGridRow row = serverRows[i];
                ServerRunState previousState = row.RunState;
                ServerRunState currentState = services.ProcessService.SyncState(row.ServerUuid);
                if (currentState != previousState)
                {
                    if (previousState == ServerRunState.Running && currentState == ServerRunState.Stopped)
                    {
                        ArmaServerConfig config = services.ConfigService.Get(row.ServerUuid);
                        ResetMonitoringOnlineIfEnabled(config);
                        if (!suppressStopNotification)
                        {
                            ShowServerStoppedNotification(row, config);
                        }
                        else
                        {
                            suppressStopNotification = false;
                        }
                    }

                    row.RunState = currentState;
                    RefreshCachedConfig(row.ServerUuid);
                    stateChanged = true;
                }
            }

            if (stateChanged)
            {
                BindServerTable();
                if (serverTable.SelectedIndex > 0)
                {
                    serverTable.SelectedIndex = serverTable.SelectedIndex;
                }
            }

            if (!string.IsNullOrEmpty(services.CurrentServerUuid))
            {
                settingsHost.RefreshOverview();
            }
        }

        private void RefreshCachedConfig(string serverUuid)
        {
            ArmaServerConfig config = services.ConfigService.Get(serverUuid);
            services.LoadedConfigs[serverUuid] = config;
        }

        private void ResetMonitoringOnlineIfEnabled(ArmaServerConfig config)
        {
            if (config == null || !config.ServerTaskManagement.EnableMonitoringService)
            {
                return;
            }

            try
            {
                services.MonitoringQueryService.InitPlayerOnlineInfo(config.ServerUUID);
            }
            catch
            {
            }
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

        private void ShowServerStoppedNotification(ServerGridRow row, ArmaServerConfig config)
        {
            if (trayNotifyIcon == null)
            {
                return;
            }

            string serverName = row.ConfigName;
            if (config != null && !string.IsNullOrWhiteSpace(config.ConfigName))
            {
                serverName = config.ConfigName;
            }

            trayNotifyIcon.BalloonTipTitle = "服务器已停止";
            trayNotifyIcon.BalloonTipText = serverName + " 进程已退出，请检查 RPT 日志或重新启动。";
            trayNotifyIcon.Visible = true;
            trayNotifyIcon.ShowBalloonTip(5000);
        }
    }

    internal sealed class NewServerDialog : AntdDialogForm
    {
        private readonly AntdUI.Input nameInput;
        private readonly AntdUI.Input dirInput;

        public NewServerDialog()
            : base()
        {
            Text = "新建服务器配置";
            ApplyPreferredDialogSizing(480, 160, null);

            var layout = SettingsLayoutHelper.CreateFormLayout(96);
            nameInput = SettingsLayoutHelper.AddRow(layout, "配置名称", SettingsLayoutHelper.CreateInput(true));
            nameInput.Text = "新服务器";

            AntButton browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            browseButton.Click += OnBrowseDirectory;

            var dirPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            dirInput = SettingsLayoutHelper.CreateInput(false);
            dirInput.Width = UiScaleHelper.Scale(360);
            dirPanel.Controls.Add(dirInput);
            dirPanel.Controls.Add(browseButton);
            SettingsLayoutHelper.AddRow(layout, "服务器目录", dirPanel);

            AntButton okButton = AntdUiHelper.CreatePrimaryButton("确定");
            okButton.Click += delegate
            {
                DialogResult = DialogResult.OK;
                Close();
            };
            AntButton cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            cancelButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            Control body = SettingsLayoutHelper.CreateScrollHost(layout);

            Controls.Add(body);
            Controls.Add(CreateButtonBar(okButton, cancelButton));
        }

        private void OnBrowseDirectory(object sender, EventArgs e)
        {
            using (var folderDialog = new FolderBrowserDialog())
            {
                if (folderDialog.ShowDialog(this) == DialogResult.OK)
                {
                    dirInput.Text = folderDialog.SelectedPath;
                }
            }
        }

        public string ConfigName
        {
            get { return nameInput.Text.Trim(); }
        }

        public string ServerDirectory
        {
            get { return dirInput.Text.Trim(); }
        }
    }

    internal sealed class CloneServerDialog : AntdDialogForm
    {
        private readonly AntdUI.Input nameInput;
        private readonly AntdUI.Input dirInput;

        public CloneServerDialog(ArmaServerConfig source)
            : base()
        {
            Text = "复制服务器配置";
            ApplyPreferredDialogSizing(480, 180, null);

            var layout = SettingsLayoutHelper.CreateFormLayout(96);
            string defaultName = "副本";
            if (source != null && !string.IsNullOrWhiteSpace(source.ConfigName))
            {
                defaultName = source.ConfigName.Trim() + " - 副本";
            }

            nameInput = SettingsLayoutHelper.AddRow(layout, "配置名称", SettingsLayoutHelper.CreateInput(true));
            nameInput.Text = defaultName;

            AntButton browseButton = SettingsLayoutHelper.CreateButton("浏览...");
            browseButton.Click += OnBrowseDirectory;

            var dirPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, AutoSize = true };
            dirInput = SettingsLayoutHelper.CreateInput(false);
            dirInput.Width = UiScaleHelper.Scale(360);
            if (source != null && !string.IsNullOrWhiteSpace(source.ServerDir))
            {
                dirInput.Text = source.ServerDir;
            }

            dirPanel.Controls.Add(dirInput);
            dirPanel.Controls.Add(browseButton);
            SettingsLayoutHelper.AddRow(layout, "服务器目录", dirPanel);

            AntLabel hint = AntdUiHelper.CreateHintLabel(
                "将复制当前 json 配置并生成新 UUID。不会复制服务器文件目录内容。",
                440);
            hint.Dock = DockStyle.Top;

            AntButton okButton = AntdUiHelper.CreatePrimaryButton("确定");
            okButton.Click += delegate
            {
                DialogResult = DialogResult.OK;
                Close();
            };
            AntButton cancelButton = AntdUiHelper.CreateToolbarButton("取消");
            cancelButton.Click += delegate
            {
                DialogResult = DialogResult.Cancel;
                Close();
            };

            Control body = SettingsLayoutHelper.CreateScrollHost(layout);

            Controls.Add(CreateButtonBar(okButton, cancelButton));
            Controls.Add(body);
            Controls.Add(hint);
        }

        private void OnBrowseDirectory(object sender, EventArgs e)
        {
            using (var folderDialog = new FolderBrowserDialog())
            {
                if (folderDialog.ShowDialog(this) == DialogResult.OK)
                {
                    dirInput.Text = folderDialog.SelectedPath;
                }
            }
        }

        public string ConfigName
        {
            get { return nameInput.Text.Trim(); }
        }

        public string ServerDirectory
        {
            get { return dirInput.Text.Trim(); }
        }
    }
}
