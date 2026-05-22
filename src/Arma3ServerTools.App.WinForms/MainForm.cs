using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
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
    internal enum ServerListSortMode
    {
        Name = 0,
        RunningFirst = 1,
        LastSaved = 2,
    }

    internal sealed class MainForm : AntdUI.Window
    {
        private readonly AppServices services = AppServices.Instance;
        private readonly AntdUI.PageHeader pageHeader;
        private readonly AntTable serverTable;
        private readonly AntInput serverSearchInput;
        private readonly ServerSettingsHost settingsHost;
        private readonly Panel settingsPanelHost;
        private readonly EmptyServerGuidePanel emptyServerGuidePanel;
        private readonly AntLabel statusServerLabel;
        private readonly AntLabel statusSaveLabel;
        private readonly AntButton startButton;
        private readonly AntButton stopButton;
        private readonly AntButton saveButton;
        private readonly AntButton writeCfgButton;
        private readonly AntButton newServerButton;
        private readonly AntButton renameServerButton;
        private readonly AntButton copyServerButton;
        private readonly AntButton deleteServerButton;
        private readonly AntdUI.Select serverSortSelect;
        private readonly ServerConfigSnapshotTracker configSnapshots = new ServerConfigSnapshotTracker();
        private readonly SplitContainer split;
        private readonly List<ServerGridRow> serverRows = new List<ServerGridRow>();
        private string serverSearchFilter = string.Empty;
        private ServerListSortMode serverListSortMode = ServerListSortMode.Name;
        private readonly System.Windows.Forms.Timer statePollTimer;
        private readonly NotifyIcon trayNotifyIcon;
        private bool trayExitRequested;
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
            saveButton = CreateActionButton(UiLabels.SaveToToolButton, AntdUI.TTypeMini.Default);
            writeCfgButton = CreateActionButton(UiLabels.ApplyToServerButton, AntdUI.TTypeMini.Default);
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
            emptyServerGuidePanel = new EmptyServerGuidePanel();
            emptyServerGuidePanel.FirstServerWizardRequested += OnQuickSetupWizard;
            emptyServerGuidePanel.NewServerRequested += OnNewServer;
            emptyServerGuidePanel.OpenGuideRequested += OnOpenFirstServerGuide;
            settingsPanelHost = new Panel { Dock = DockStyle.Fill };
            settingsHost.Dock = DockStyle.Fill;
            emptyServerGuidePanel.Dock = DockStyle.Fill;
            settingsPanelHost.Controls.Add(settingsHost);
            settingsPanelHost.Controls.Add(emptyServerGuidePanel);

            newServerButton = CreateListActionButton("新建", AntdUI.TTypeMini.Primary);
            renameServerButton = CreateListActionButton("重命名", AntdUI.TTypeMini.Default);
            copyServerButton = CreateListActionButton("复制", AntdUI.TTypeMini.Default);
            deleteServerButton = CreateListActionButton("删除", AntdUI.TTypeMini.Default);
            newServerButton.Click += OnNewServer;
            renameServerButton.Click += OnRenameServer;
            copyServerButton.Click += OnCopyServer;
            deleteServerButton.Click += OnDeleteServer;

            serverSortSelect = SettingsLayoutHelper.CreateSelect(120, "按名称", "运行优先", "按保存时间");
            serverSortSelect.Margin = new Padding(0, UiScaleHelper.Scale(4), 0, UiScaleHelper.Scale(4));
            serverSortSelect.SelectedIndex = 0;
            serverSortSelect.SelectedIndexChanged += OnServerSortChanged;

            var serverListHost = new Panel
            {
                Dock = DockStyle.Fill,
            };
            serverTable.Dock = DockStyle.Fill;
            serverSearchInput.Dock = DockStyle.Top;
            Control serverListToolbar = BuildServerListToolbar();
            serverListToolbar.Dock = DockStyle.Top;
            serverListHost.Controls.Add(serverTable);
            serverListHost.Controls.Add(serverListToolbar);
            serverListHost.Controls.Add(serverSearchInput);

            split = new SplitContainer
            {
                Dock = DockStyle.Fill,
                Orientation = Orientation.Vertical,
            };
            split.Panel1.Padding = UiScaleHelper.ScalePadding(8);
            split.Panel2.Padding = UiScaleHelper.ScalePadding(8);
            split.Panel1.Controls.Add(serverListHost);
            split.Panel2.Controls.Add(settingsPanelHost);
            SplitContainerHelper.BindProportionalSplit(split, 0.34, false, 240, 420);

            Control statusPanel = BuildStatusPanel();

            Controls.Add(split);
            Controls.Add(statusPanel);
            Controls.Add(topChrome);

            Load += OnMainFormLoad;
            Shown += OnMainFormShown;
            FormClosed += OnMainFormClosed;
            FormClosing += OnMainFormClosing;
            Resize += OnMainFormResize;
            KeyPreview = true;
            KeyDown += OnMainFormKeyDown;

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

            InitializeTrayIcon();
        }

        private void InitializeTrayIcon()
        {
            var contextMenu = new ContextMenuStrip();
            ToolStripMenuItem showItem = new ToolStripMenuItem("显示主窗口");
            showItem.Click += OnTrayShowMainWindow;
            ToolStripMenuItem exitItem = new ToolStripMenuItem("退出");
            exitItem.Click += OnTrayExitApplication;
            contextMenu.Items.Add(showItem);
            contextMenu.Items.Add(new ToolStripSeparator());
            contextMenu.Items.Add(exitItem);
            trayNotifyIcon.ContextMenuStrip = contextMenu;
            trayNotifyIcon.DoubleClick += OnTrayShowMainWindow;
        }

        private void OnTrayShowMainWindow(object sender, EventArgs e)
        {
            ShowMainWindowFromTray();
        }

        private void OnTrayExitApplication(object sender, EventArgs e)
        {
            trayExitRequested = true;
            Close();
        }

        private void ShowMainWindowFromTray()
        {
            Show();
            WindowState = FormWindowState.Normal;
            Activate();
            BringToFront();
        }

        private void MinimizeToTray()
        {
            Hide();
            trayNotifyIcon.Visible = true;
            UpdateTrayStatusText();
        }

        private void UpdateTrayStatusText()
        {
            if (trayNotifyIcon == null)
            {
                return;
            }

            int runningCount = 0;
            for (int i = 0; i < serverRows.Count; i++)
            {
                if (serverRows[i].RunState == ServerRunState.Running)
                {
                    runningCount++;
                }
            }

            if (runningCount > 0)
            {
                trayNotifyIcon.Text = UiLabels.AppTitle + "（" + runningCount + " 台运行中）";
            }
            else
            {
                trayNotifyIcon.Text = UiLabels.AppTitle;
            }
        }

        private static int ActionBarHeight
        {
            get { return UiScaleHelper.Scale(72); }
        }

        private Control BuildTopChrome(Control actionBar)
        {
            int headerHeight = UiScaleHelper.Scale(40);
            int barHeight = ActionBarHeight;

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
            int verticalPadding = UiScaleHelper.Scale(10);
            var panel = new AntdUI.Panel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(UiScaleHelper.Scale(12), verticalPadding, UiScaleHelper.Scale(12), verticalPadding),
                BackColor = Color.FromArgb(245, 247, 250),
            };

            var rightLayout = new FlowLayoutPanel
            {
                Dock = DockStyle.Right,
                AutoSize = true,
                WrapContents = false,
                FlowDirection = FlowDirection.LeftToRight,
                Padding = new Padding(0),
                Margin = new Padding(0),
            };

            var leftLayout = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                AutoSize = true,
                WrapContents = true,
                Padding = new Padding(0),
                Margin = new Padding(0),
            };
            leftLayout.Controls.Add(startButton);
            leftLayout.Controls.Add(stopButton);
            leftLayout.Controls.Add(CreateDivider());
            leftLayout.Controls.Add(saveButton);
            leftLayout.Controls.Add(writeCfgButton);

            AntButton aboutButton = CreateActionButton("关于", AntdUI.TTypeMini.Default);
            aboutButton.Click += OnAbout;
            rightLayout.Controls.Add(aboutButton);
            rightLayout.Controls.Add(CreateToolsMenuButton());
            rightLayout.Controls.Add(CreateServerMenuButton());

            panel.Controls.Add(leftLayout);
            panel.Controls.Add(rightLayout);
            return panel;
        }

        private AntDropdown CreateServerMenuButton()
        {
            int verticalMargin = UiScaleHelper.Scale(2);
            var dropdown = new AntDropdown
            {
                Text = "服务器",
                Type = AntdUI.TTypeMini.Default,
                Margin = new Padding(0, verticalMargin, UiScaleHelper.Scale(8), verticalMargin),
            };
            dropdown.Items.AddRange(new object[]
            {
                new AntdUI.SelectItem("new", "新建..."),
                new AntdUI.SelectItem("rename", "重命名..."),
                new AntdUI.SelectItem("copy", "复制为新建..."),
                new AntdUI.SelectItem("delete", "删除"),
                new AntdUI.SelectItem("refresh", "刷新列表"),
                new AntdUI.SelectItem("sep1", "-"),
                new AntdUI.SelectItem("openConfig", "打开配置目录"),
                new AntdUI.SelectItem("openServerConfig", "打开服务器配置目录"),
                new AntdUI.SelectItem("installServer", "安装/更新专用服务器..."),
            });
            dropdown.ItemClick += delegate(object sender, AntdUI.ObjectNEventArgs e)
            {
                string id = Convert.ToString(e.Value);
                if (id == "new")
                {
                    OnNewServer(sender, EventArgs.Empty);
                }
                else if (id == "rename")
                {
                    OnRenameServer(sender, EventArgs.Empty);
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
                else if (id == "openServerConfig")
                {
                    OnOpenServerConfigDirectory(sender, EventArgs.Empty);
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
            int verticalMargin = UiScaleHelper.Scale(2);
            var dropdown = new AntDropdown
            {
                Text = "工具",
                Type = AntdUI.TTypeMini.Default,
                Margin = new Padding(0, verticalMargin, 0, verticalMargin),
            };
            dropdown.Items.Add(new AntdUI.SelectItem("quickSetup", "首服向导..."));
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

        private static AntButton CreateListActionButton(string text, AntdUI.TTypeMini type)
        {
            int verticalMargin = UiScaleHelper.Scale(4);
            return new AntButton
            {
                Text = text,
                Type = type,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Margin = new Padding(0, verticalMargin, UiScaleHelper.Scale(6), verticalMargin),
            };
        }

        private Control BuildServerListToolbar()
        {
            int verticalPadding = UiScaleHelper.Scale(6);
            var panel = new Panel
            {
                AutoSize = true,
                Dock = DockStyle.Top,
                Padding = new Padding(0, verticalPadding, 0, verticalPadding),
                Margin = new Padding(0),
            };

            var flow = new FlowLayoutPanel
            {
                AutoSize = true,
                Dock = DockStyle.Fill,
                WrapContents = true,
                FlowDirection = FlowDirection.LeftToRight,
                Padding = new Padding(0),
                Margin = new Padding(0),
            };
            flow.Controls.Add(newServerButton);
            flow.Controls.Add(renameServerButton);
            flow.Controls.Add(copyServerButton);
            flow.Controls.Add(deleteServerButton);
            flow.Controls.Add(new AntdUI.Label
            {
                Text = "排序",
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(UiScaleHelper.Scale(8), UiScaleHelper.Scale(10), UiScaleHelper.Scale(4), UiScaleHelper.Scale(10)),
            });
            flow.Controls.Add(serverSortSelect);
            panel.Controls.Add(flow);
            return panel;
        }

        private static Control CreateDivider()
        {
            int verticalMargin = UiScaleHelper.Scale(6);
            return new AntdUI.Divider
            {
                Vertical = true,
                Margin = new Padding(UiScaleHelper.Scale(4), verticalMargin, UiScaleHelper.Scale(12), verticalMargin),
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
            IEnumerable<ServerGridRow> rows = serverRows;
            if (!string.IsNullOrWhiteSpace(serverSearchFilter))
            {
                string filter = serverSearchFilter;
                rows = rows.Where(row => RowMatchesSearch(row, filter));
            }

            return ApplyServerListSort(rows).ToList();
        }

        private IEnumerable<ServerGridRow> ApplyServerListSort(IEnumerable<ServerGridRow> rows)
        {
            if (serverListSortMode == ServerListSortMode.RunningFirst)
            {
                return rows
                    .OrderByDescending(row => row.RunState == ServerRunState.Running)
                    .ThenBy(row => row.ConfigName, StringComparer.OrdinalIgnoreCase);
            }

            if (serverListSortMode == ServerListSortMode.LastSaved)
            {
                return rows.OrderByDescending(row => row.SaveTime, StringComparer.OrdinalIgnoreCase);
            }

            return rows.OrderBy(row => row.ConfigName, StringComparer.OrdinalIgnoreCase);
        }

        private void OnServerSortChanged(object sender, AntdUI.IntEventArgs e)
        {
            if (serverSortSelect.SelectedIndex == 1)
            {
                serverListSortMode = ServerListSortMode.RunningFirst;
            }
            else if (serverSortSelect.SelectedIndex == 2)
            {
                serverListSortMode = ServerListSortMode.LastSaved;
            }
            else
            {
                serverListSortMode = ServerListSortMode.Name;
            }

            string previousUuid = services.CurrentServerUuid;
            BindServerTable();
            RestoreServerSelection(previousUuid);
        }

        private void OnMainFormKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Control && e.KeyCode == Keys.S)
            {
                OnSaveConfig(this, EventArgs.Empty);
                e.Handled = true;
            }
        }

        private void OnMainFormClosing(object sender, FormClosingEventArgs e)
        {
            if (!trayExitRequested && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                MinimizeToTray();
                return;
            }

            UnsavedChangesChoice choice = PromptUnsavedChangesIfNeeded();
            if (choice == UnsavedChangesChoice.Cancel)
            {
                e.Cancel = true;
                return;
            }

            if (choice == UnsavedChangesChoice.Save)
            {
                if (!SaveCurrentConfigInternal(false))
                {
                    e.Cancel = true;
                    return;
                }
            }
            else if (choice == UnsavedChangesChoice.ApplyToServer)
            {
                if (!WriteCurrentConfigInternal(false))
                {
                    e.Cancel = true;
                    return;
                }
            }

            UiBackgroundTasks.ShutdownScheduler(services.SchedulerService);
        }

        private bool HasUnsavedChanges()
        {
            string uuid = services.CurrentServerUuid;
            if (string.IsNullOrEmpty(uuid))
            {
                return false;
            }

            settingsHost.ApplyAll();
            ArmaServerConfig config = services.GetCurrentConfig();
            return configSnapshots.HasChanges(uuid, config);
        }

        private UnsavedChangesChoice PromptUnsavedChangesIfNeeded()
        {
            if (!HasUnsavedChanges())
            {
                return UnsavedChangesChoice.Discard;
            }

            ArmaServerConfig config = services.GetCurrentConfig();
            string configName = config != null ? config.ConfigName : "当前配置";
            using (var dialog = new UnsavedChangesDialog(configName))
            {
                if (dialog.ShowDialog(this) != DialogResult.OK)
                {
                    return UnsavedChangesChoice.Cancel;
                }

                return dialog.Choice;
            }
        }

        private bool EnsureUnsavedChangesHandled()
        {
            UnsavedChangesChoice choice = PromptUnsavedChangesIfNeeded();
            if (choice == UnsavedChangesChoice.Cancel)
            {
                return false;
            }

            if (choice == UnsavedChangesChoice.Save)
            {
                return SaveCurrentConfigInternal(false);
            }

            if (choice == UnsavedChangesChoice.ApplyToServer)
            {
                return WriteCurrentConfigInternal(false);
            }

            return true;
        }

        private void CapturePersistedSnapshot(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                return;
            }

            ArmaServerConfig config;
            if (!services.LoadedConfigs.TryGetValue(serverUuid, out config) || config == null)
            {
                return;
            }

            configSnapshots.CapturePersisted(serverUuid, config);
        }

        private void CaptureServerAppliedSnapshot(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                return;
            }

            ArmaServerConfig config;
            if (!services.LoadedConfigs.TryGetValue(serverUuid, out config) || config == null)
            {
                return;
            }

            configSnapshots.CaptureServerApplied(serverUuid, config);
        }

        private bool SaveCurrentConfigInternal(bool showSuccessMessage)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return false;
            }

            ApplyCurrentSettings();
            config.SetTime();
            services.ConfigService.Save(config);
            SyncSchedulerJobs(config);
            CapturePersistedSnapshot(config.ServerUUID);
            UpdateStatusBar(config);
            RefreshSelectedRowState();
            if (showSuccessMessage)
            {
                AntdUiHelper.ShowInfo(this, UiLabels.SaveToToolSuccess, "成功");
            }

            return true;
        }

        private bool WriteCurrentConfigInternal(bool showSuccessMessage)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return false;
            }

            ApplyCurrentSettings();
            config.SetTime();
            services.ConfigService.Save(config);
            OperationResult cfgResult = services.ConfigWriter.WriteAll(config);
            if (!cfgResult.Success)
            {
                AntdUiHelper.ShowError(this, cfgResult.Message, "失败");
                return false;
            }

            OperationResult deployResult = services.MonitoringDeploymentService.DeployIfEnabled(config);
            if (!deployResult.Success)
            {
                AntdUiHelper.ShowError(this, deployResult.Message, "失败");
                return false;
            }

            SyncSchedulerJobs(config);
            CapturePersistedSnapshot(config.ServerUUID);
            CaptureServerAppliedSnapshot(config.ServerUUID);
            UpdateStatusBar(config);
            RefreshSelectedRowState();
            if (showSuccessMessage)
            {
                AntdUiHelper.ShowInfo(this, UiLabels.ApplyToServerSuccess, "成功");
            }

            return true;
        }

        private bool TrySwitchToServer(ServerGridRow row)
        {
            if (row == null)
            {
                return false;
            }

            if (row.ServerUuid == services.CurrentServerUuid)
            {
                return true;
            }

            UnsavedChangesChoice choice = PromptUnsavedChangesIfNeeded();
            if (choice == UnsavedChangesChoice.Cancel)
            {
                return false;
            }

            if (choice == UnsavedChangesChoice.Save)
            {
                if (!SaveCurrentConfigInternal(false))
                {
                    return false;
                }
            }
            else if (choice == UnsavedChangesChoice.ApplyToServer)
            {
                if (!WriteCurrentConfigInternal(false))
                {
                    return false;
                }
            }

            ApplySelectedServer(row);
            return true;
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
            if (WindowState == FormWindowState.Minimized && !trayExitRequested)
            {
                MinimizeToTray();
            }

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

            MonitoringHostLauncher.StopStartedHost();
        }

        private void OnMainFormLoad(object sender, EventArgs e)
        {
            ConfigurePageHeaderIcon();
            EnsureConfigDirectory();
            AppUiSettings.LoadFrom(services.Paths.ConfigDirectory);
            settingsHost.ReloadUiSettings();
            StartMonitoringHost();
            ReloadServers();
            statePollTimer.Start();
            UiBackgroundTasks.WarmScheduler(services.SchedulerService);
            UiBackgroundTasks.WarmSteamCmdResolution(services.SteamCmdService);
        }

        private void OnMainFormShown(object sender, EventArgs e)
        {
            if (WindowState == FormWindowState.Minimized)
            {
                WindowState = FormWindowState.Normal;
            }

            Activate();
            BringToFront();
            Focus();
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
            configSnapshots.Clear();
            foreach (var pair in services.ConfigService.List())
            {
                try
                {
                    ArmaServerConfig config = services.ConfigService.Get(pair.ServerUuid);
                    services.LoadedConfigs[config.ServerUUID] = config;
                    configSnapshots.Capture(config.ServerUUID, config);
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
            UpdateRightPanelState();
        }

        private void UpdateRightPanelState()
        {
            bool hasServers = serverRows.Count > 0;
            emptyServerGuidePanel.Visible = !hasServers;
            settingsHost.Visible = hasServers;
            startButton.Enabled = hasServers;
            stopButton.Enabled = hasServers;
            saveButton.Enabled = hasServers;
            writeCfgButton.Enabled = hasServers;
        }

        private void OnOpenFirstServerGuide(object sender, EventArgs e)
        {
            EmptyServerGuidePanel.TryOpenFirstServerGuideDocument();
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

            UpdateRightPanelState();
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

            ServerGridRow targetRow = visibleRows[rowIndex];
            if (!TrySwitchToServer(targetRow))
            {
                suppressTableSelectionEvent = true;
                try
                {
                    SelectServer(services.CurrentServerUuid);
                }
                finally
                {
                    suppressTableSelectionEvent = false;
                }
            }
        }

        private void ApplySelectedServer(ServerGridRow row)
        {
            services.CurrentServerUuid = row.ServerUuid;
            settingsHost.Bind(services.GetCurrentConfig());
            UpdateStatusBar(services.GetCurrentConfig());
        }

        private void OnNewServer(object sender, EventArgs e)
        {
            if (!EnsureUnsavedChangesHandled())
            {
                return;
            }

            using (var dialog = new NewServerDialog())
            {
                if (dialog.ShowDialog(this) != DialogResult.OK)
                {
                    return;
                }

                if (string.IsNullOrWhiteSpace(dialog.ConfigName))
                {
                    AntdUiHelper.ShowWarning(this, "配置名称不能为空。", "提示");
                    return;
                }

                if (string.IsNullOrWhiteSpace(dialog.ServerDirectory))
                {
                    AntdUiHelper.ShowWarning(this, "请选择服务器目录。", "提示");
                    return;
                }

                ArmaServerConfig config = services.ConfigService.Create(dialog.ConfigName, dialog.ServerDirectory);
                services.LoadedConfigs[config.ServerUUID] = config;
                services.CurrentServerUuid = config.ServerUUID;
                ReloadServers();
                SelectServer(config.ServerUUID);
            }
        }

        private void OnRenameServer(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                AntdUiHelper.ShowInfo(this, "请先选择要重命名的服务器配置。", "提示");
                return;
            }

            if (HasUnsavedChanges())
            {
                AntdUiHelper.ShowInfo(this, "请先保存当前配置，再使用重命名。", "提示");
                return;
            }

            using (var dialog = new TextInputDialog("重命名配置", "配置名称", config.ConfigName))
            {
                if (dialog.ShowDialog(this) != DialogResult.OK)
                {
                    return;
                }

                string newName = dialog.InputText.Trim();
                if (string.IsNullOrEmpty(newName))
                {
                    AntdUiHelper.ShowWarning(this, "配置名称不能为空。", "提示");
                    return;
                }

                if (string.Equals(newName, config.ConfigName, StringComparison.Ordinal))
                {
                    return;
                }

                config.ConfigName = newName;
                config.SetTime();
                services.ConfigService.Save(config);
                services.LoadedConfigs[config.ServerUUID] = config;
                CapturePersistedSnapshot(config.ServerUUID);
                ReloadServers();
                SelectServer(config.ServerUUID);
            }
        }

        private void OnCopyServer(object sender, EventArgs e)
        {
            if (!EnsureUnsavedChangesHandled())
            {
                return;
            }

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
                AntdUiHelper.ShowInfo(this, "请先选择要删除的服务器配置。", "提示");
                return;
            }

            ServerRunState runState = services.ProcessService.GetState(config.ServerUUID);
            if (runState == ServerRunState.Running)
            {
                AntdUiHelper.ShowWarning(
                    this,
                    "服务器 \"" + config.ConfigName + "\" 仍在运行。请先停止进程，再删除配置。",
                    "无法删除");
                return;
            }

            if (!EnsureUnsavedChangesHandled())
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
            configSnapshots.Remove(config.ServerUUID);
            ReloadServers();
        }

        private void ApplyCurrentSettings()
        {
            settingsHost.ApplyAll();
        }

        private void OnSaveConfig(object sender, EventArgs e)
        {
            RunPrimaryActionAsync(SaveCurrentConfigAsync);
        }

        private void OnWriteCfg(object sender, EventArgs e)
        {
            RunPrimaryActionAsync(WriteConfigFilesAsync);
        }

        private void OnStartServer(object sender, EventArgs e)
        {
            RunPrimaryActionAsync(StartServerAsync);
        }

        private async void RunPrimaryActionAsync(Func<Task> action)
        {
            SetPrimaryActionButtonsEnabled(false);
            try
            {
                await action().ConfigureAwait(true);
            }
            finally
            {
                SetPrimaryActionButtonsEnabled(true);
            }
        }

        private void SetPrimaryActionButtonsEnabled(bool enabled)
        {
            startButton.Enabled = enabled;
            stopButton.Enabled = enabled;
            saveButton.Enabled = enabled;
            writeCfgButton.Enabled = enabled;
        }

        private async Task SaveCurrentConfigAsync()
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            ApplyCurrentSettings();
            config.SetTime();
            await Task.Run(() => services.ConfigService.Save(config)).ConfigureAwait(true);
            SyncSchedulerJobs(config);
            CapturePersistedSnapshot(config.ServerUUID);
            UpdateStatusBar(config);
            RefreshSelectedRowState();
            AntdUiHelper.ShowInfo(this, UiLabels.SaveToToolSuccess, "成功");
        }

        private async Task WriteConfigFilesAsync()
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            ApplyCurrentSettings();
            config.SetTime();

            OperationResult writeResult = await Task.Run(() =>
            {
                services.ConfigService.Save(config);
                OperationResult cfgResult = services.ConfigWriter.WriteAll(config);
                if (!cfgResult.Success)
                {
                    return cfgResult;
                }

                return services.MonitoringDeploymentService.DeployIfEnabled(config);
            }).ConfigureAwait(true);

            SyncSchedulerJobs(config);
            CapturePersistedSnapshot(config.ServerUUID);
            if (writeResult.Success)
            {
                CaptureServerAppliedSnapshot(config.ServerUUID);
                UpdateStatusBar(config);
                RefreshSelectedRowState();
                AntdUiHelper.ShowInfo(this, UiLabels.ApplyToServerSuccess, "成功");
            }
            else
            {
                AntdUiHelper.ShowError(this, writeResult.Message, "失败");
            }
        }

        private async Task StartServerAsync()
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            ApplyCurrentSettings();
            config.SetTime();

            await Task.Run(() => services.ConfigService.Save(config)).ConfigureAwait(true);
            SyncSchedulerJobs(config);
            CapturePersistedSnapshot(config.ServerUUID);

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

            if (services.PreflightChecker.HasBlockingWarnings(preflightItems))
            {
                using (var dialog = new PreflightReportForm(preflightItems, true))
                {
                    if (dialog.ShowDialog(this) != DialogResult.OK)
                    {
                        return;
                    }
                }
            }

            OperationResult result = await Task.Run(
                () => services.ProcessService.Start(config.ServerUUID)).ConfigureAwait(true);
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

                CaptureServerAppliedSnapshot(config.ServerUUID);
                UpdateStatusBar(config);
                AntdUiHelper.ShowInfo(this, UiLabels.StartServerSuccess, "成功");
            }
            else
            {
                AntdUiHelper.ShowError(this, result.Message, "启动失败");
            }

            RefreshSelectedRowState();
        }

        private void OnQuickSetupWizard(object sender, EventArgs e)
        {
            if (!EnsureUnsavedChangesHandled())
            {
                return;
            }

            using (var dialog = new FirstServerWizardForm())
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
                if (dialog.AppliedConfigToServer)
                {
                    CaptureServerAppliedSnapshot(config.ServerUUID);
                    UpdateStatusBar(config);
                }
            }
        }

        private void OnStopServer(object sender, EventArgs e)
        {
            RunPrimaryActionAsync(StopServerAsync);
        }

        private async Task StopServerAsync()
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            suppressStopNotification = true;
            OperationResult result = await Task.Run(
                () => services.ProcessService.Stop(config.ServerUUID)).ConfigureAwait(true);
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
            UiBackgroundTasks.SyncSchedulerJobs(
                services.SchedulerService,
                config,
                delegate(string message)
                {
                    if (IsDisposed)
                    {
                        return;
                    }

                    if (InvokeRequired)
                    {
                        BeginInvoke(new Action(delegate
                        {
                            AntdUiHelper.ShowWarning(this, "定时任务同步失败: " + message, "警告");
                        }));
                        return;
                    }

                    AntdUiHelper.ShowWarning(this, "定时任务同步失败: " + message, "警告");
                });
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
                services.ModScannerService.EnsureDefaultWorkshopPath(dialog.BuildSettings());
                AntdUiHelper.ShowInfo(this, "SteamCMD 配置已保存。", "成功");
            }
        }

        private void OnInstallDedicatedServer(object sender, EventArgs e)
        {
            RunPrimaryActionAsync(InstallDedicatedServerAsync);
        }

        private async Task InstallDedicatedServerAsync()
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

            if (!await SteamCmdUiHelper.EnsureSteamCmdAvailableAsync(this, services.SteamCmdService)
                .ConfigureAwait(true))
            {
                return;
            }

            OperationResult result = await Task.Run(
                () => services.SteamCmdService.InstallDedicatedServer(installDir)).ConfigureAwait(true);
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

        private void OnOpenServerConfigDirectory(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null || string.IsNullOrEmpty(config.ServerDir) || string.IsNullOrEmpty(config.ServerUUID))
            {
                AntdUiHelper.ShowInfo(this, "请先选择服务器。", "提示");
                return;
            }

            string path = Path.Combine(config.ServerDir, ToolConstants.ServerConfigFolderName, config.ServerUUID);
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
                UpdateStatusBar(services.GetCurrentConfig());
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

            UpdateTrayStatusText();

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
            statusSaveLabel.Text = BuildConfigSyncStatusText(config);
        }

        private string BuildConfigSyncStatusText(ArmaServerConfig config)
        {
            if (config == null)
            {
                return string.Empty;
            }

            string uuid = config.ServerUUID;
            settingsHost.ApplyAll();
            ArmaServerConfig current = services.GetCurrentConfig();
            if (current == null)
            {
                current = config;
            }

            if (configSnapshots.HasChanges(uuid, current))
            {
                return UiLabels.StatusUnsavedChanges;
            }

            if (configSnapshots.HasServerCfgDrift(uuid, current))
            {
                return UiLabels.StatusServerCfgDrift;
            }

            return UiLabels.FormatSyncedStatus(config.SaveTime);
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
}
