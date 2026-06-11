using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.Controls;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.App.WinForms.Main;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Application.Session;
using Arma3ServerTools.Application.Sync;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Microsoft.Extensions.Logging;
using AntButton = AntdUI.Button;
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
        private readonly IAppServices services;
        private readonly ServerLifecycleCoordinator lifecycleCoordinator;
        private readonly TrayNotificationController trayController;
        private readonly AntdUI.PageHeader pageHeader;
        private readonly Control actionBarPanel;
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
        private readonly FlowLayoutPanel serverListToolbarFlow;
        private readonly AntButton aboutButton;
        private readonly AntButton toolsMenuButton;
        private readonly AntButton serverMenuButton;
        private readonly AntLabel serverSortLabel;
        private readonly ServerConfigSnapshotTracker configSnapshots = new ServerConfigSnapshotTracker();
        private readonly ConfigSyncIndicatorDebouncer configSyncDebouncer;
        private int serverReloadVersion;
        private readonly SplitContainer split;
        private readonly List<ServerGridRow> serverRows = new List<ServerGridRow>();
        private volatile ArmaServerConfig[] pollServerConfigs = Array.Empty<ArmaServerConfig>();
        private string serverSearchFilter = string.Empty;
        private ServerListSortMode serverListSortMode = ServerListSortMode.Name;
        private readonly ServerStatePollWorker statePollWorker;
        private int refreshSelectedRowVersion;
        private bool suppressStopNotification;
        private bool suppressTableSelectionEvent;
        private string currentConfigRefreshModeHint = string.Empty;
        private int lastReportedRunningCount = -1;
        private readonly System.Windows.Forms.Timer searchDebounceTimer;
        private int serverRowsVersion;
        private List<ServerGridRow> cachedVisibleRows = new List<ServerGridRow>();
        private string cachedFilter = string.Empty;
        private ServerListSortMode cachedSortMode;
        private int cachedServerRowsVersion = -1;
        private readonly System.Windows.Forms.Timer resizeDebounceTimer;
        private Dictionary<string, int> pollRowIndexCache = new Dictionary<string, int>(StringComparer.Ordinal);
        private int pollCacheVersion = -1;
        private string cachedCompareSnapshot;
        private string cachedCompareSnapshotUuid;
        private int refreshConfigSyncVersion;

        public MainForm(IAppServices services, ServerLifecycleCoordinator lifecycleCoordinator)
        {
            this.services = services;
            this.lifecycleCoordinator = lifecycleCoordinator;
            trayController = new TrayNotificationController();
            AppIcon.ApplyTo(this);
            Text = UiLabels.AppTitle;
            ClientSize = UiScaleHelper.ScaleSize(1100, 720);
            MinimumSize = UiScaleHelper.ScaleSize(820, 560);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.White;
            FormBorderStyle = FormBorderStyle.Sizable;
            ControlBox = false;
            MaximizeBox = false;
            MinimizeBox = false;

            pageHeader = new AntdUI.PageHeader
            {
                Text = UiLabels.AppTitle,
                SubText = string.Empty,
                ShowButton = true,
                ShowIcon = true,
                MinimizeBox = true,
                MaximizeBox = true,
                FullBox = false,
                CancelButton = true,
                MDI = false,
                DragMove = true,
                EnableDoubleClickMaximize = true,
                DividerShow = true,
                UseTitleFont = true,
                UseTextBold = true,
                UseLeftMargin = false,
                CloseSize = UiScaleHelper.Scale(40),
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

            serverListToolbarFlow = new FlowLayoutPanel();
            aboutButton = CreateActionButton("关于", AntdUI.TTypeMini.Default);
            toolsMenuButton = CreateToolsMenuButton();
            serverMenuButton = CreateServerMenuButton();
            serverSortLabel = new AntLabel();
            actionBarPanel = BuildActionBar();
            Control topChrome = BuildTopChrome();
            serverTable = CreateServerTable();
            serverSearchInput = CreateServerSearchInput();
            settingsHost = new ServerSettingsHost(services);
            settingsHost.SyncIndicatorsChanged += OnSettingsSyncIndicatorsChanged;
            settingsHost.ExternalConfigSaved += OnExternalPanelConfigSaved;
            configSyncDebouncer = new ConfigSyncIndicatorDebouncer(this, RefreshConfigSyncIndicatorsCore, 120);
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
            SplitContainerHelper.BindProportionalSplit(split, 0.30, false, 220, 340);

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

            statePollWorker = new ServerStatePollWorker(
                services.ProcessService,
                this,
                GetPollServerConfigsSnapshot,
                ApplyPollResults);

            trayController.AttachToForm(this);

            searchDebounceTimer = new System.Windows.Forms.Timer { Interval = 200 };
            searchDebounceTimer.Tick += OnSearchDebounceTimerTick;

            resizeDebounceTimer = new System.Windows.Forms.Timer { Interval = 80 };
            resizeDebounceTimer.Tick += OnResizeDebounceTimerTick;
        }

        private IReadOnlyList<ArmaServerConfig> GetPollServerConfigsSnapshot()
        {
            return pollServerConfigs;
        }

        private void RefreshPollConfigSnapshot()
        {
            ArmaServerConfig[] configs = new ArmaServerConfig[serverRows.Count];
            for (int i = 0; i < serverRows.Count; i++)
            {
                string serverUuid = serverRows[i].ServerUuid;
                if (string.IsNullOrEmpty(serverUuid))
                {
                    continue;
                }

                ServerConfigSession session;
                if (services.TryGetSession(serverUuid, out session) && session != null)
                {
                    configs[i] = session.Model;
                    continue;
                }

                ArmaServerConfig config;
                if (services.LoadedConfigs.TryGetValue(serverUuid, out config) && config != null)
                {
                    configs[i] = config;
                    continue;
                }

                session = services.Sessions.GetOrLoad(serverUuid);
                if (session != null)
                {
                    services.LoadedConfigs[serverUuid] = session.Model;
                    configs[i] = session.Model;
                }
            }

            pollServerConfigs = configs;
        }

        /// <summary>操作栏最小高度（逻辑像素），按钮换行时自动增高。</summary>
        private static int ActionBarHeight
        {
            get { return UiScaleHelper.Scale(48); }
        }

        private Control BuildTopChrome()
        {
            int headerHeight = UiScaleHelper.Scale(52);
            pageHeader.Dock = DockStyle.Top;
            pageHeader.Height = headerHeight;
            pageHeader.MinimumSize = new Size(0, headerHeight);

            actionBarPanel.Dock = DockStyle.Top;
            actionBarPanel.Margin = new Padding(0);

            var chrome = new Panel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = new Padding(0),
                Padding = new Padding(0),
            };
            chrome.Controls.Add(pageHeader);
            chrome.Controls.Add(actionBarPanel);
            actionBarPanel.BringToFront();
            return chrome;
        }

        private Control BuildActionBar()
        {
            int verticalPadding = UiScaleHelper.Scale(10);
            var leftLayout = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                WrapContents = true,
                AutoScroll = false,
                FlowDirection = FlowDirection.LeftToRight,
                Padding = new Padding(
                    UiScaleHelper.Scale(12), verticalPadding, UiScaleHelper.Scale(12), verticalPadding),
                Margin = new Padding(0),
                MinimumSize = new Size(0, ActionBarHeight),
                BackColor = Color.FromArgb(245, 247, 250),
            };
            leftLayout.Controls.Add(startButton);
            leftLayout.Controls.Add(stopButton);
            leftLayout.Controls.Add(CreateDivider());
            leftLayout.Controls.Add(saveButton);
            leftLayout.Controls.Add(writeCfgButton);
            leftLayout.Controls.Add(CreateDivider());

            aboutButton.Click += OnAbout;
            leftLayout.Controls.Add(aboutButton);
            leftLayout.Controls.Add(toolsMenuButton);
            leftLayout.Controls.Add(serverMenuButton);

            return leftLayout;
        }

        private AntButton CreateServerMenuButton()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add(CreateToolbarMenuItem("新建...", OnNewServer));
            menu.Items.Add(CreateToolbarMenuItem("重命名...", OnRenameServer));
            menu.Items.Add(CreateToolbarMenuItem("复制为新建...", OnCopyServer));
            menu.Items.Add(CreateToolbarMenuItem("删除", OnDeleteServer));
            menu.Items.Add(CreateToolbarMenuItem("刷新列表", delegate (object sender, EventArgs e)
            {
                ReloadServers(AppUiSettings.Instance.AllowExternalConfigRefresh);
            }));
            menu.Items.Add(CreateToolbarMenuItem("配置读取模式：性能优先（推荐）", delegate (object sender, EventArgs e)
            {
                SetConfigRefreshMode(false);
            }));
            menu.Items.Add(CreateToolbarMenuItem("配置读取模式：兼容（手动刷新读磁盘）", delegate (object sender, EventArgs e)
            {
                SetConfigRefreshMode(true);
            }));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(CreateToolbarMenuItem("自动快照：关闭", delegate (object sender, EventArgs e)
            {
                SetAutoSnapshotMode(AutoSnapshotMode.Off);
            }));
            menu.Items.Add(CreateToolbarMenuItem("自动快照：保存配置前", delegate (object sender, EventArgs e)
            {
                SetAutoSnapshotMode(AutoSnapshotMode.BeforeSave);
            }));
            menu.Items.Add(CreateToolbarMenuItem("自动快照：写入服务器前（默认）", delegate (object sender, EventArgs e)
            {
                SetAutoSnapshotMode(AutoSnapshotMode.BeforeWrite);
            }));
            menu.Items.Add(CreateToolbarMenuItem("自动快照：后台异步（切换）", delegate (object sender, EventArgs e)
            {
                ToggleAutoSnapshotAsync();
            }));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(CreateToolbarMenuItem("打开配置目录", OnOpenConfigDirectory));
            menu.Items.Add(CreateToolbarMenuItem("打开服务器配置目录", OnOpenServerConfigDirectory));
            menu.Items.Add(CreateToolbarMenuItem("安装/更新专用服务器...", OnInstallDedicatedServer));
            return AntdUiHelper.CreateToolbarMenuButton("服务器", menu);
        }

        private AntButton CreateToolsMenuButton()
        {
            var menu = new ContextMenuStrip();
            menu.Items.Add(CreateToolbarMenuItem("首服向导...", OnQuickSetupWizard));
            menu.Items.Add(CreateToolbarMenuItem("SteamCMD 设置...", OnSteamCmdSettings));
            menu.Items.Add(CreateToolbarMenuItem("Agent / OpenClaw 设置...", OnAgentSettings));
            menu.Items.Add(CreateToolbarMenuItem("关于...", OnAbout));
            return AntdUiHelper.CreateToolbarMenuButton("工具", menu);
        }

        private static ToolStripMenuItem CreateToolbarMenuItem(string text, EventHandler handler)
        {
            var item = new ToolStripMenuItem(text);
            item.Click += handler;
            return item;
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
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(0, verticalPadding, 0, verticalPadding),
                Margin = new Padding(0),
            };

            serverListToolbarFlow.AutoSize = true;
            serverListToolbarFlow.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            serverListToolbarFlow.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Right;
            serverListToolbarFlow.WrapContents = true;
            serverListToolbarFlow.AutoScroll = false;
            serverListToolbarFlow.FlowDirection = FlowDirection.LeftToRight;
            serverListToolbarFlow.Padding = new Padding(0);
            serverListToolbarFlow.Margin = new Padding(0);
            serverListToolbarFlow.MinimumSize = new Size(0, UiScaleHelper.Scale(30));
            serverListToolbarFlow.Controls.Add(newServerButton);
            serverListToolbarFlow.Controls.Add(renameServerButton);
            serverListToolbarFlow.Controls.Add(copyServerButton);
            serverListToolbarFlow.Controls.Add(deleteServerButton);
            serverSortLabel.Text = "排序";
            serverSortLabel.AutoSizeMode = AntdUI.TAutoSize.Auto;
            serverSortLabel.Padding = new Padding(UiScaleHelper.Scale(8), UiScaleHelper.Scale(10), UiScaleHelper.Scale(4), UiScaleHelper.Scale(10));
            serverListToolbarFlow.Controls.Add(serverSortLabel);
            serverListToolbarFlow.Controls.Add(serverSortSelect);
            panel.Controls.Add(serverListToolbarFlow);
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
            searchDebounceTimer.Stop();
            searchDebounceTimer.Start();
        }

        private void OnSearchDebounceTimerTick(object sender, EventArgs e)
        {
            searchDebounceTimer.Stop();
            string previousUuid = services.CurrentServerUuid;
            BindServerTable();
            RestoreServerSelection(previousUuid);
        }

        private IReadOnlyList<ServerGridRow> GetFilteredServerRows()
        {
            if (cachedFilter == serverSearchFilter
                && cachedSortMode == serverListSortMode
                && cachedServerRowsVersion == serverRowsVersion)
            {
                return cachedVisibleRows;
            }

            IEnumerable<ServerGridRow> rows = serverRows;
            if (!string.IsNullOrWhiteSpace(serverSearchFilter))
            {
                string filter = serverSearchFilter;
                rows = rows.Where(row => RowMatchesSearch(row, filter));
            }

            cachedVisibleRows = ApplyServerListSort(rows).ToList();
            cachedFilter = serverSearchFilter;
            cachedSortMode = serverListSortMode;
            cachedServerRowsVersion = serverRowsVersion;
            return cachedVisibleRows;
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
            if (!trayController.ExitRequestedFlag && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                trayController.MinimizeFormToTray(this);
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
            statePollWorker.Stop();
        }

        private bool HasUnsavedChanges()
        {
            string uuid = services.CurrentServerUuid;
            if (string.IsNullOrEmpty(uuid))
            {
                return false;
            }

            ServerConfigSession session = services.GetCurrentSession();
            if (session != null && session.HasUnsavedChanges)
            {
                return true;
            }

            if (settingsHost.HasLocalEdits())
            {
                return true;
            }

            if (session != null)
            {
                return false;
            }

            ArmaServerConfig config = services.GetCurrentConfig();
            string snapshot = TryGetCachedCompareSnapshot(uuid);
            if (snapshot != null)
            {
                return configSnapshots.HasChanges(uuid, snapshot);
            }

            return configSnapshots.HasChanges(uuid, config);
        }

        private void InvalidateCompareSnapshot()
        {
            cachedCompareSnapshot = null;
            cachedCompareSnapshotUuid = null;
        }

        private void SetCompareSnapshotCache(string serverUuid, string snapshot)
        {
            cachedCompareSnapshotUuid = serverUuid;
            cachedCompareSnapshot = snapshot;
        }

        private string TryGetCachedCompareSnapshot(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid) || string.IsNullOrEmpty(cachedCompareSnapshot))
            {
                return null;
            }

            if (!string.Equals(cachedCompareSnapshotUuid, serverUuid, StringComparison.Ordinal))
            {
                return null;
            }

            return cachedCompareSnapshot;
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

        private void CapturePersistedSnapshot(string serverUuid, string snapshot = null)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                return;
            }

            if (snapshot != null)
            {
                configSnapshots.CapturePersisted(serverUuid, snapshot);
                return;
            }

            ArmaServerConfig config;
            if (!services.LoadedConfigs.TryGetValue(serverUuid, out config) || config == null)
            {
                return;
            }

            configSnapshots.CapturePersisted(serverUuid, config);
        }

        private bool SaveCurrentConfigInternal(bool showSuccessMessage)
        {
            return SaveCurrentConfigInternalAsync(showSuccessMessage).GetAwaiter().GetResult();
        }

        private async Task<bool> SaveCurrentConfigInternalAsync(bool showSuccessMessage)
        {
            ServerConfigSession session = services.GetCurrentSession();
            if (session == null)
            {
                return false;
            }

            ApplyCurrentSettings(force: true);
            services.SyncPersistenceSettingsFromUi();
            PersistConfigWorkResult workResult = await PersistConfigWorkAsync(
                session,
                persistenceSession => services.Persistence.SavePackageAsync(persistenceSession)).ConfigureAwait(true);
            if (!workResult.Result.Success)
            {
                return false;
            }

            SyncSchedulerJobs(session.Model);
            SetCompareSnapshotCache(session.ServerUuid, workResult.CompareSnapshot);
            CapturePersistedSnapshot(session.ServerUuid, workResult.CompareSnapshot);
            settingsHost.ClearDirtyMarkers();
            configSyncDebouncer.Flush();
            RefreshSelectedRowState();
            if (showSuccessMessage)
            {
                AntdUiHelper.ShowInfo(this, UiLabels.SaveToToolSuccess, "成功");
            }

            return true;
        }

        private bool WriteCurrentConfigInternal(bool showSuccessMessage)
        {
            return WriteCurrentConfigInternalAsync(showSuccessMessage).GetAwaiter().GetResult();
        }

        private async Task<bool> WriteCurrentConfigInternalAsync(bool showSuccessMessage)
        {
            ServerConfigSession session = services.GetCurrentSession();
            if (session == null)
            {
                return false;
            }

            ApplyCurrentSettings(force: true);
            services.SyncPersistenceSettingsFromUi();
            PersistConfigWorkResult workResult = await PersistConfigWorkAsync(
                session,
                persistenceSession => services.Persistence.SaveAndWriteAsync(persistenceSession)).ConfigureAwait(true);
            if (!workResult.Result.Success)
            {
                AntdUiHelper.ShowError(this, workResult.Result.Message, "失败");
                return false;
            }

            SyncSchedulerJobs(session.Model);
            SetCompareSnapshotCache(session.ServerUuid, workResult.CompareSnapshot);
            CapturePersistedSnapshot(session.ServerUuid, workResult.CompareSnapshot);
            settingsHost.ClearDirtyMarkers();
            configSyncDebouncer.Flush();
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
            if (WindowState == FormWindowState.Minimized && !trayController.ExitRequestedFlag)
            {
                trayController.MinimizeFormToTray(this);
                return;
            }

            resizeDebounceTimer.Stop();
            resizeDebounceTimer.Start();
        }

        private void OnResizeDebounceTimerTick(object sender, EventArgs e)
        {
            resizeDebounceTimer.Stop();
            if (IsDisposed)
            {
                return;
            }

            UpdateHeaderResponsiveLayout();
            UpdateActionBarResponsiveLayout();

            if (split.Width > 0 && split.Tag == null)
            {
                SplitContainerHelper.ApplyInitialDistance(split, 0.34, false);
            }
        }

        private void OnMainFormClosed(object sender, FormClosedEventArgs e)
        {
            searchDebounceTimer.Dispose();
            resizeDebounceTimer.Dispose();
            configSyncDebouncer.Dispose();
            statePollWorker.Dispose();
            trayController.Dispose();

            MonitoringHostLauncher.StopStartedHost();
        }

        private async void OnMainFormLoad(object sender, EventArgs e)
        {
            ConfigurePageHeaderIcon();
            EnsureConfigDirectory();
            AppUiSettings.LoadFrom(services.Paths.ConfigDirectory);
            services.SyncPersistenceSettingsFromUi();
            UpdateConfigRefreshModeHint();
            UpdateActionBarResponsiveLayout();
            settingsHost.ReloadUiSettings();
            WarnIfSteamCmdConfigLoadFailed();
            StartMonitoringHost();
            await ReloadServersAsync(true).ConfigureAwait(true);
            statePollWorker.Start();
            UiBackgroundTasks.WarmScheduler(services.SchedulerService);
            UiBackgroundTasks.WarmSteamCmdResolution(services.SteamCmdService);
        }

        private void SetAutoSnapshotMode(AutoSnapshotMode mode)
        {
            AppUiSettings.Instance.AutoSnapshotMode = mode;
            AppUiSettings.Instance.Save(services.Paths.ConfigDirectory);
            services.SyncPersistenceSettingsFromUi();
            string message;
            if (mode == AutoSnapshotMode.Off)
            {
                message = "已关闭保存/写入前的自动配置快照。";
            }
            else if (mode == AutoSnapshotMode.BeforeSave)
            {
                message = "将在保存配置到工具前自动创建快照。";
            }
            else
            {
                message = "将在写入服务器目录前自动创建快照（推荐）。";
            }

            AntdUiHelper.ShowInfo(this, message, "自动快照");
        }

        private void ToggleAutoSnapshotAsync()
        {
            AppUiSettings.Instance.AutoSnapshotAsync = !AppUiSettings.Instance.AutoSnapshotAsync;
            AppUiSettings.Instance.Save(services.Paths.ConfigDirectory);
            services.SyncPersistenceSettingsFromUi();
            string message;
            if (AppUiSettings.Instance.AutoSnapshotAsync)
            {
                message = "自动快照将在后台执行，不阻塞保存/写入。";
            }
            else
            {
                message = "自动快照将在保存/写入时同步执行。";
            }

            AntdUiHelper.ShowInfo(this, message, "自动快照");
        }

        private void SetConfigRefreshMode(bool allowExternalConfigRefresh)
        {
            AppUiSettings.Instance.AllowExternalConfigRefresh = allowExternalConfigRefresh;
            AppUiSettings.Instance.Save(services.Paths.ConfigDirectory);
            UpdateConfigRefreshModeHint();
            AntdUiHelper.ShowInfo(
                this,
                allowExternalConfigRefresh ? UiLabels.ConfigRefreshModeCompatibility : UiLabels.ConfigRefreshModePerformance,
                "配置读取模式");
        }

        private void UpdateConfigRefreshModeHint()
        {
            if (AppUiSettings.Instance.AllowExternalConfigRefresh)
            {
                currentConfigRefreshModeHint = UiLabels.ConfigRefreshModeCompatibility;
            }
            else
            {
                currentConfigRefreshModeHint = UiLabels.ConfigRefreshModePerformance;
            }

            UpdateHeaderResponsiveLayout();
        }

        private void UpdateHeaderResponsiveLayout()
        {
            int showSubTextWidth = UiScaleHelper.Scale(1280);
            int shortTitleWidth = UiScaleHelper.Scale(980);
            int headerButtonReserve = UiScaleHelper.Scale(132);
            int width = ClientSize.Width;
            int availableTitleWidth = width - headerButtonReserve;
            if (availableTitleWidth < UiScaleHelper.Scale(120))
            {
                pageHeader.ShowIcon = false;
            }
            else
            {
                pageHeader.ShowIcon = true;
            }

            pageHeader.UseLeftMargin = false;
            pageHeader.SubText = string.Empty;
            if (width >= showSubTextWidth)
            {
                pageHeader.Text = UiLabels.AppTitle;
                pageHeader.SubText = currentConfigRefreshModeHint;
                return;
            }

            if (width >= shortTitleWidth)
            {
                pageHeader.Text = UiLabels.AppTitle;
                return;
            }

            pageHeader.Text = "A3ST";
        }

        private void UpdateActionBarResponsiveLayout()
        {
            aboutButton.Visible = true;
            toolsMenuButton.Visible = true;
            serverMenuButton.Visible = true;
            renameServerButton.Visible = true;
            copyServerButton.Visible = true;
            deleteServerButton.Visible = true;
            serverSortLabel.Visible = true;
            serverSortSelect.Visible = true;
        }

        private void OnMainFormShown(object sender, EventArgs e)
        {
            if (WindowState == FormWindowState.Minimized)
            {
                WindowState = FormWindowState.Normal;
            }

            UpdateHeaderResponsiveLayout();
            UpdateActionBarResponsiveLayout();
            Activate();
            BringToFront();
            Focus();
        }

        private void ConfigurePageHeaderIcon()
        {
            AppIcon.ApplyTo(pageHeader);
            trayController.SyncIcon(AppIcon.GetIcon());
            UpdateHeaderResponsiveLayout();
            pageHeader.Invalidate();
        }

        private void EnsureConfigDirectory()
        {
            Directory.CreateDirectory(services.Paths.ConfigDirectory);
        }

        private void WarnIfSteamCmdConfigLoadFailed()
        {
            services.GetSteamCmdSettings();
            string warning = services.SteamCmdConfigProvider.LastLoadWarning;
            if (!string.IsNullOrEmpty(warning))
            {
                AntdUiHelper.ShowWarning(this, warning, "SteamCMD 配置");
            }
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

        private void ReloadServers(bool forceDiskReload)
        {
            _ = ReloadServersAsync(forceDiskReload);
        }

        private async Task ReloadServersAsync(bool forceDiskReload)
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            int currentVersion = Interlocked.Increment(ref serverReloadVersion);
            string previousUuid = services.CurrentServerUuid;

            ServerReloadBundle bundle;
            try
            {
                bundle = await Task.Run(
                    () => BuildServerReloadBundle(forceDiskReload))
                    .ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                if (currentVersion == serverReloadVersion && !IsDisposed)
                {
                    AntdUiHelper.ShowError(this, "读取配置列表失败: " + ex.Message, "错误");
                }

                return;
            }

            if (currentVersion != serverReloadVersion || IsDisposed)
            {
                return;
            }

            ApplyServerReloadBundle(bundle, previousUuid);
            services.Logger.LogInformation(
                "ReloadServers completed in {ElapsedMs} ms (source={Source}, reads={ReadCount}, servers={ServerCount}).",
                stopwatch.ElapsedMilliseconds,
                bundle.Source,
                bundle.ConfigReadCount,
                serverRows.Count);
        }

        private ServerReloadBundle BuildServerReloadBundle(bool forceDiskReload)
        {
            var bundle = new ServerReloadBundle();
            if (forceDiskReload)
            {
                services.Sessions.Clear();
            }

            IReadOnlyList<ServerListItem> summaries = services.Sessions.ListSummaries();
            bundle.ConfigReadCount = summaries.Count;
            if (forceDiskReload)
            {
                bundle.Source = "disk-summary";
            }
            else
            {
                bundle.Source = "memory-summary";
            }

            var configsDict = new Dictionary<string, ArmaServerConfig>(StringComparer.Ordinal);
            foreach (ServerListItem item in summaries)
            {
                if (item == null || string.IsNullOrEmpty(item.ServerUuid))
                {
                    continue;
                }

                string serverUuid = item.ServerUuid;
                ServerConfigSession session;
                if (services.TryGetSession(serverUuid, out session))
                {
                    configsDict[serverUuid] = session.Model;
                    bundle.PersistedSnapshots[serverUuid] = session.PersistedFingerprint;
                }
                else
                {
                    ArmaServerConfig loadedConfig;
                    if (services.LoadedConfigs.TryGetValue(serverUuid, out loadedConfig) && loadedConfig != null)
                    {
                        configsDict[serverUuid] = loadedConfig;
                    }
                }

                ServerRunState runState = ServerRunState.Stopped;
                ArmaServerConfig peekConfig;
                if (configsDict.TryGetValue(serverUuid, out peekConfig))
                {
                    runState = services.ProcessService.PeekState(peekConfig);
                }

                bundle.Rows.Add(new ServerGridRow
                {
                    ConfigName = item.ConfigName,
                    ServerUuid = serverUuid,
                    SaveTime = item.SaveTime,
                    RunState = runState,
                });
            }

            bundle.Configs = configsDict;
            return bundle;
        }

        private void ApplyServerReloadBundle(ServerReloadBundle bundle, string previousUuid)
        {
            serverRows.Clear();
            configSnapshots.Clear();
            services.LoadedConfigs.Clear();
            foreach (KeyValuePair<string, ArmaServerConfig> pair in bundle.Configs)
            {
                services.LoadedConfigs[pair.Key] = pair.Value;
            }

            foreach (KeyValuePair<string, string> snapshot in bundle.PersistedSnapshots)
            {
                configSnapshots.CapturePersisted(snapshot.Key, snapshot.Value);
            }

            serverRows.AddRange(bundle.Rows);
            serverRowsVersion++;
            BindServerTable();
            RefreshPollConfigSnapshot();
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

        private bool ShouldRebindServerTableForStateChanges()
        {
            if (serverListSortMode == ServerListSortMode.RunningFirst)
            {
                return true;
            }

            return false;
        }

        private void RefreshServerTableViewPreserveSelection()
        {
            suppressTableSelectionEvent = true;
            try
            {
                int selectedIndex = serverTable.SelectedIndex;
                serverTable.Refresh();
                if (selectedIndex > 0)
                {
                    serverTable.SelectedIndex = selectedIndex;
                }
            }
            finally
            {
                suppressTableSelectionEvent = false;
            }
        }

        private void RefreshTableAfterStateChanges()
        {
            string selectedServerUuid = services.CurrentServerUuid;
            if (ShouldRebindServerTableForStateChanges())
            {
                BindServerTable();
                RestoreServerSelection(selectedServerUuid);
                return;
            }

            RefreshServerTableViewPreserveSelection();
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
            InvalidateCompareSnapshot();
            ServerConfigSession session = services.Sessions.GetOrLoad(row.ServerUuid);
            if (session != null)
            {
                services.LoadedConfigs[row.ServerUuid] = session.Model;
                string persisted = session.PersistedFingerprint;
                configSnapshots.CapturePersisted(row.ServerUuid, persisted);
                SetCompareSnapshotCache(row.ServerUuid, persisted);
                settingsHost.Attach(session);
            }
            else
            {
                settingsHost.Bind(services.GetCurrentConfig());
            }

            configSyncDebouncer.Flush();
        }

        private static async Task<PersistConfigWorkResult> PersistConfigWorkAsync(
            ServerConfigSession session,
            Func<ServerConfigSession, Task<OperationResult>> persistAction)
        {
            string snapshot = session.Fingerprint;
            OperationResult result = await persistAction(session).ConfigureAwait(false);
            return new PersistConfigWorkResult(result, snapshot);
        }

        private ServerRunState ResolveRowRunState(ArmaServerConfig config)
        {
            if (config == null)
            {
                return ServerRunState.Stopped;
            }

            ServerRunState peekState = services.ProcessService.PeekState(config);
            if (peekState == ServerRunState.Stopped && config.ServerTaskManagement.ProcessById > 0)
            {
                return services.ProcessService.SyncState(config);
            }

            return peekState;
        }

        private sealed class PersistConfigWorkResult
        {
            public PersistConfigWorkResult(OperationResult result, string compareSnapshot)
            {
                Result = result;
                CompareSnapshot = compareSnapshot;
            }

            public OperationResult Result { get; }

            public string CompareSnapshot { get; }
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
                services.EnsureSession(config);
                services.CurrentServerUuid = config.ServerUUID;
                ReloadServers(true);
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

            using (var dialog = new TextInputDialog("重命名配置", "配置名称", config.ConfigName, this))
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
                ReloadServers(true);
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
                ReloadServers(true);
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
            services.Sessions.Unload(config.ServerUUID);
            services.LoadedConfigs.Remove(config.ServerUUID);
            configSnapshots.Remove(config.ServerUUID);
            ReloadServers(true);
        }

        private void ApplyCurrentSettings(bool force = false)
        {
            settingsHost.ApplyAll(force);
        }

        private void OnSaveConfig(object sender, EventArgs e)
        {
            RunPrimaryActionAsync("SaveConfig", SaveCurrentConfigAsync);
        }

        private void OnWriteCfg(object sender, EventArgs e)
        {
            RunPrimaryActionAsync("WriteConfigFiles", WriteConfigFilesAsync);
        }

        private void OnStartServer(object sender, EventArgs e)
        {
            RunPrimaryActionAsync("StartServer", StartServerAsync);
        }

        private async void RunPrimaryActionAsync(string actionName, Func<Task> action)
        {
            SetPrimaryActionButtonsEnabled(false);
            try
            {
                using (UiPerformanceProbe.BeginScope("MainForm." + actionName, services.CurrentServerUuid))
                {
                    await action().ConfigureAwait(true);
                }
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
            ServerConfigSession session = services.GetCurrentSession();
            if (session == null)
            {
                return;
            }

            ApplyCurrentSettings(force: true);
            services.SyncPersistenceSettingsFromUi();
            PersistConfigWorkResult workResult = await PersistConfigWorkAsync(
                session,
                persistenceSession => services.Persistence.SavePackageAsync(persistenceSession)).ConfigureAwait(true);
            if (!workResult.Result.Success)
            {
                return;
            }

            SyncSchedulerJobs(session.Model);
            SetCompareSnapshotCache(session.ServerUuid, workResult.CompareSnapshot);
            CapturePersistedSnapshot(session.ServerUuid, workResult.CompareSnapshot);
            settingsHost.ClearDirtyMarkers();
            configSyncDebouncer.Flush();
            AntdUiHelper.ShowInfo(this, UiLabels.SaveToToolSuccess, "成功");
        }

        private async Task WriteConfigFilesAsync()
        {
            ServerConfigSession session = services.GetCurrentSession();
            if (session == null)
            {
                return;
            }

            ApplyCurrentSettings(force: true);
            services.SyncPersistenceSettingsFromUi();
            PersistConfigWorkResult workResult = await PersistConfigWorkAsync(
                session,
                persistenceSession => services.Persistence.SaveAndWriteAsync(persistenceSession)).ConfigureAwait(true);

            if (!workResult.Result.Success)
            {
                AntdUiHelper.ShowError(this, workResult.Result.Message, "失败");
                configSyncDebouncer.Flush();
                return;
            }

            SyncSchedulerJobs(session.Model);
            SetCompareSnapshotCache(session.ServerUuid, workResult.CompareSnapshot);
            CapturePersistedSnapshot(session.ServerUuid, workResult.CompareSnapshot);
            settingsHost.ClearDirtyMarkers();
            configSyncDebouncer.Flush();
            AntdUiHelper.ShowInfo(this, UiLabels.ApplyToServerSuccess, "成功");
        }

        private async Task StartServerAsync()
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            ApplyCurrentSettings(force: true);
            services.SyncPersistenceSettingsFromUi();
            ServerConfigSession session = services.EnsureSession(config);
            OperationResult saveResult = await services.Persistence.SavePackageAsync(session).ConfigureAwait(true);
            if (!saveResult.Success)
            {
                return;
            }

            SyncSchedulerJobs(config);
            RefreshConfigSyncIndicators();

            // 快照和脏标记在预检通过+用户确认启动成功后才清除（见 line ~1565）
            IReadOnlyList<PreflightCheckItem> preflightItems = lifecycleCoordinator.BuildPreflightItems(config);
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

            OperationResult result = await Task.Run(() => lifecycleCoordinator.StartServer(config)).ConfigureAwait(true);
            if (result.Success)
            {
                if (config.ServerTaskManagement.EnableHeadlessClient)
                {
                    string hcUuid = config.ServerUUID;
                    _ = Task.Run(() =>
                    {
                        services.ProcessService.StartHeadlessClient(hcUuid);
                    });
                }

                settingsHost.ClearDirtyMarkers();
                RefreshConfigSyncIndicators();
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

            using (var dialog = new FirstServerWizardForm(services))
            {
                if (dialog.ShowDialog(this) != DialogResult.OK || dialog.CreatedConfig == null)
                {
                    return;
                }

                ArmaServerConfig config = dialog.CreatedConfig;
                services.LoadedConfigs[config.ServerUUID] = config;
                services.CurrentServerUuid = config.ServerUUID;
                ReloadServers(true);
                SelectServer(config.ServerUUID);
                if (dialog.AppliedConfigToServer)
                {
                    CapturePersistedSnapshot(config.ServerUUID);
                    settingsHost.ClearDirtyMarkers();
                    RefreshConfigSyncIndicators();
                }
            }
        }

        private void OnStopServer(object sender, EventArgs e)
        {
            RunPrimaryActionAsync("StopServer", StopServerAsync);
        }

        private async Task StopServerAsync()
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            suppressStopNotification = true;
            OperationResult result = await Task.Run(() => lifecycleCoordinator.StopServer(config)).ConfigureAwait(true);
            if (!result.Success)
            {
                AntdUiHelper.ShowWarning(this, result.Message, "停止失败");
            }
            else
            {
                lifecycleCoordinator.SyncProcessStateToCache(config);
            }

            RefreshSelectedRowState();
        }

        private void SyncSchedulerJobs(ArmaServerConfig config)
        {
            UiBackgroundTasks.SyncSchedulerJobs(
                services.SchedulerService,
                config,
                delegate (string message)
                {
                    if (IsDisposed || !IsHandleCreated)
                    {
                        return;
                    }

                    if (InvokeRequired)
                    {
                        try
                        {
                            BeginInvoke(new Action(delegate
                            {
                                if (IsDisposed)
                                {
                                    return;
                                }

                                AntdUiHelper.ShowWarning(this, "定时任务同步失败: " + message, "警告");
                            }));
                        }
                        catch (ObjectDisposedException)
                        {
                            // Form can be disposed between checks and BeginInvoke during shutdown.
                        }
                        catch (InvalidOperationException)
                        {
                            // Handle can be destroyed while closing; warning UI is optional.
                        }

                        return;
                    }

                    AntdUiHelper.ShowWarning(this, "定时任务同步失败: " + message, "警告");
                });
        }

        private void OnAgentSettings(object sender, EventArgs e)
        {
            using (var dialog = new AgentSettingsForm(services, this))
            {
                dialog.ShowDialog(this);
            }
        }

        private void OnSteamCmdSettings(object sender, EventArgs e)
        {
            using (var dialog = new SteamCmdConfigForm(services, services.GetSteamCmdSettings(), this))
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
            RunPrimaryActionAsync("InstallDedicatedServer", InstallDedicatedServerAsync);
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

            if (!await SteamCmdUiHelper.EnsureSteamCmdAvailableAsync(this, services.SteamCmdService, services.Paths)
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

        private async void RefreshSelectedRowState()
        {
            string currentServerUuid = services.CurrentServerUuid;
            if (string.IsNullOrEmpty(currentServerUuid))
            {
                return;
            }

            ArmaServerConfig currentConfig = services.GetCurrentConfig();
            if (currentConfig == null)
            {
                return;
            }

            using (UiPerformanceProbe.BeginScope("MainForm.RefreshSelectedRowState", currentServerUuid))
            {
                int currentVersion = Interlocked.Increment(ref refreshSelectedRowVersion);
                ServerRunState runState = await Task.Run(() => ResolveRowRunState(currentConfig)).ConfigureAwait(true);
                if (IsDisposed || currentVersion != refreshSelectedRowVersion)
                {
                    return;
                }

                for (int i = 0; i < serverRows.Count; i++)
                {
                    if (serverRows[i].ServerUuid != currentServerUuid)
                    {
                        continue;
                    }

                    serverRows[i].RunState = runState;
                    serverRows[i].SaveTime = currentConfig.SaveTime;

                    RefreshTableAfterStateChanges();
                    settingsHost.RefreshOverview();
                    return;
                }
            }
        }

        private void OnSettingsSyncIndicatorsChanged(object sender, EventArgs e)
        {
            InvalidateCompareSnapshot();
            configSyncDebouncer.Schedule();
        }

        private void OnExternalPanelConfigSaved(object sender, EventArgs e)
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                return;
            }

            CapturePersistedSnapshot(config.ServerUUID);
            configSyncDebouncer.Flush();
        }

        private void RefreshConfigSyncIndicators()
        {
            configSyncDebouncer.Schedule();
        }

        private void RefreshConfigSyncIndicatorsCore()
        {
            ArmaServerConfig config = services.GetCurrentConfig();
            if (config == null)
            {
                UpdateStatusBar(null, ConfigSyncState.Saved);
                return;
            }

            if (settingsHost.HasLocalEdits())
            {
                settingsHost.UpdateSyncIndicators(ConfigSyncState.Unsaved);
                UpdateStatusBar(config, ConfigSyncState.Unsaved);
                UpdateActionButtonMarkers(ConfigSyncState.Unsaved);
                return;
            }

            string snapshot = TryGetCachedCompareSnapshot(config.ServerUUID);
            if (snapshot != null)
            {
                ApplyConfigSyncState(config, snapshot);
                return;
            }

            ScheduleConfigSyncStateCompute(config);
        }

        private void ScheduleConfigSyncStateCompute(ArmaServerConfig config)
        {
            string serverUuid = config.ServerUUID;
            int version = Interlocked.Increment(ref refreshConfigSyncVersion);
            Task.Run(
                delegate
                {
                    return ServerConfigSnapshotTracker.SerializeForCompare(config);
                }).ContinueWith(
                task =>
                {
                    if (IsDisposed || !IsHandleCreated)
                    {
                        return;
                    }

                    if (version != Volatile.Read(ref refreshConfigSyncVersion))
                    {
                        return;
                    }

                    if (task.IsFaulted || task.IsCanceled)
                    {
                        return;
                    }

                    try
                    {
                        BeginInvoke(new Action(delegate
                        {
                            if (IsDisposed || services.CurrentServerUuid != serverUuid)
                            {
                                return;
                            }

                            if (settingsHost.HasLocalEdits())
                            {
                                return;
                            }

                            string computedSnapshot = task.Result;
                            SetCompareSnapshotCache(serverUuid, computedSnapshot);
                            ArmaServerConfig current = services.GetCurrentConfig();
                            if (current != null)
                            {
                                ApplyConfigSyncState(current, computedSnapshot);
                            }
                        }));
                    }
                    catch (ObjectDisposedException)
                    {
                    }
                    catch (InvalidOperationException)
                    {
                    }
                },
                TaskScheduler.Default);
        }

        private void ApplyConfigSyncState(ArmaServerConfig config, string snapshot)
        {
            ConfigSyncState state = ConfigSyncStateEvaluator.Evaluate(
                configSnapshots,
                config.ServerUUID,
                snapshot);
            settingsHost.UpdateSyncIndicators(state);
            UpdateStatusBar(config, state);
            UpdateActionButtonMarkers(state);
        }

        private void UpdateActionButtonMarkers(ConfigSyncState state)
        {
            saveButton.Text = UiLabels.SaveToToolButton;
            writeCfgButton.Text = UiLabels.ApplyToServerButton;
            if (state == ConfigSyncState.Unsaved)
            {
                saveButton.Text += UiLabels.SaveToToolPendingMarker;
                writeCfgButton.Text += UiLabels.ApplyToServerPendingMarker;
            }
        }

        private void ApplyPollResults(IReadOnlyList<ServerStatePollResult> results)
        {
            if (results == null || results.Count == 0 || serverRows.Count == 0)
            {
                return;
            }

            // Rebuild row index cache only when server rows structure changes.
            if (pollCacheVersion != serverRowsVersion)
            {
                pollRowIndexCache.Clear();
                for (int i = 0; i < serverRows.Count; i++)
                {
                    string serverUuid = serverRows[i].ServerUuid;
                    if (!string.IsNullOrEmpty(serverUuid) && !pollRowIndexCache.ContainsKey(serverUuid))
                    {
                        pollRowIndexCache[serverUuid] = i;
                    }
                }

                pollCacheVersion = serverRowsVersion;
            }

            Dictionary<string, int> rowIndexByUuid = pollRowIndexCache;
            int runningCount = 0;
            for (int i = 0; i < serverRows.Count; i++)
            {
                if (serverRows[i].RunState == ServerRunState.Running)
                {
                    runningCount++;
                }
            }

            bool stateChanged = false;
            bool currentServerStateChanged = false;
            ServerRunState currentServerPollState = ServerRunState.Stopped;
            int persistedBySyncStateCount = 0;
            for (int r = 0; r < results.Count; r++)
            {
                ServerStatePollResult result = results[r];
                if (string.IsNullOrEmpty(result.ServerUuid))
                {
                    continue;
                }

                int rowIndex;
                if (!rowIndexByUuid.TryGetValue(result.ServerUuid, out rowIndex))
                {
                    continue;
                }

                ServerGridRow row = serverRows[rowIndex];
                ServerRunState previousState = row.RunState;
                if (result.RunState == previousState)
                {
                    if (result.PersistedBySyncState)
                    {
                        persistedBySyncStateCount++;
                    }
                    continue;
                }

                // Adjust running count for state transition.
                if (previousState == ServerRunState.Running)
                {
                    runningCount--;
                }

                if (result.RunState == ServerRunState.Running)
                {
                    runningCount++;
                }

                if (string.Equals(result.ServerUuid, services.CurrentServerUuid, StringComparison.Ordinal))
                {
                    currentServerStateChanged = true;
                    currentServerPollState = result.RunState;
                }

                if (previousState == ServerRunState.Running && result.RunState == ServerRunState.Stopped)
                {
                    ArmaServerConfig config;
                    services.LoadedConfigs.TryGetValue(row.ServerUuid, out config);

                    lifecycleCoordinator.TryResetMonitoringOnline(config);
                    if (!suppressStopNotification)
                    {
                        ShowServerStoppedNotification(row, config);
                    }
                    else
                    {
                        suppressStopNotification = false;
                    }
                }

                row.RunState = result.RunState;
                ArmaServerConfig rowConfig;
                if (services.LoadedConfigs.TryGetValue(row.ServerUuid, out rowConfig) && rowConfig != null)
                {
                    row.SaveTime = rowConfig.SaveTime;
                }
                if (result.PersistedBySyncState)
                {
                    persistedBySyncStateCount++;
                }

                stateChanged = true;
            }

            // Inline RefreshTableAfterStateChanges — reduces call overhead
            // and avoids redundant GetFilteredServerRows() when only refresh is needed.
            if (stateChanged)
            {
                if (ShouldRebindServerTableForStateChanges())
                {
                    BindServerTable();
                    RestoreServerSelection(services.CurrentServerUuid);
                }
                else
                {
                    serverTable.Refresh();
                }
            }

            if (runningCount != lastReportedRunningCount)
            {
                lastReportedRunningCount = runningCount;
                trayController.UpdateRunningCount(runningCount);
            }

            if (currentServerStateChanged && !string.IsNullOrEmpty(services.CurrentServerUuid))
            {
                settingsHost.RefreshOverviewFromPoll(currentServerPollState);
            }

            if (persistedBySyncStateCount > 0)
            {
                services.Logger.LogInformation(
                    "Server state poll persisted stale PID cleanup for {PersistCount} server(s).",
                    persistedBySyncStateCount);
            }
        }

        private void UpdateStatusBar(ArmaServerConfig config)
        {
            if (config == null)
            {
                UpdateStatusBar(null, ConfigSyncState.Saved);
                return;
            }

            RefreshConfigSyncIndicators();
        }

        private void UpdateStatusBar(ArmaServerConfig config, ConfigSyncState state)
        {
            if (config == null)
            {
                statusServerLabel.Text = "请选择服务器";
                statusSaveLabel.Text = string.Empty;
                statusSaveLabel.ForeColor = Color.FromArgb(38, 38, 38);
                UpdateActionButtonMarkers(ConfigSyncState.Saved);
                return;
            }

            statusServerLabel.Text = "当前: " + config.ConfigName;
            statusSaveLabel.Text = ConfigSyncStateUi.GetStatusText(state, config.SaveTime);
            statusSaveLabel.ForeColor = ConfigSyncStateUi.GetStatusColor(state);
        }

        private void ShowServerStoppedNotification(ServerGridRow row, ArmaServerConfig config)
        {
            string serverName = row.ConfigName;
            if (config != null && !string.IsNullOrWhiteSpace(config.ConfigName))
            {
                serverName = config.ConfigName;
            }

            trayController.ShowServerStoppedBalloon(serverName);
        }
    }
}
