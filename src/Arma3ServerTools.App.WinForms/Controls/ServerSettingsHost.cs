using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Application.Sync;
using Arma3ServerTools.Core.Models;
using AntDropdown = AntdUI.Dropdown;
using AntLabel = AntdUI.Label;
using AntTabs = AntdUI.Tabs;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class ServerSettingsHost : UserControl
    {
        private sealed class TabDefinition
        {
            public string Title { get; set; } = string.Empty;

            public Func<Control> ContentFactory { get; set; }

            public Control Content { get; set; }

            public IServerSettingsPanel SettingsPanel { get; set; }

            public bool ExpertOnly { get; set; }

            public bool ApplyLast { get; set; }

            public bool DirtyTrackingWired { get; set; }
        }

        private readonly IAppServices appServices;
        private readonly AntTabs tabs;
        private readonly AntdUI.Checkbox advancedModeCheckBox;
        private readonly AntDropdown tabJumpDropdown;
        private readonly AntLabel syncLegendLabel;
        private readonly SettingsDirtyTracker dirtyTracker;
        private readonly List<TabDefinition> tabDefinitions = new List<TabDefinition>();
        private readonly List<IServerSettingsPanel> applyPanels = new List<IServerSettingsPanel>();
        private readonly List<TabDefinition> visibleTabDefinitions = new List<TabDefinition>();
        private readonly HashSet<int> layoutReadyTabs = new HashSet<int>();
        private readonly HashSet<IServerSettingsPanel> uiSyncedPanels = new HashSet<IServerSettingsPanel>();
        private string lastSelectedTabTitle = "概览";
        private ArmaServerConfig currentConfig;
        private string boundServerUuid = string.Empty;
        private ConfigSyncState currentSyncState = ConfigSyncState.FullySynced;

        public ServerOverviewPanel OverviewPanel { get; private set; }

        public event EventHandler SyncIndicatorsChanged;

        public event EventHandler ExternalConfigSaved;

        public ServerSettingsHost(IAppServices appServices)
        {
            this.appServices = appServices;
            dirtyTracker = new SettingsDirtyTracker(OnDirtyTrackerChanged);
            Dock = DockStyle.Fill;
            BackColor = System.Drawing.Color.White;

            var topBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = UiScaleHelper.ScalePadding(0, 0, 0, 4),
            };
            advancedModeCheckBox = SettingsLayoutHelper.CreateCheckbox("显示高级设置", false);
            advancedModeCheckBox.Checked = AppUiSettings.Instance.ShowAdvancedSettings;
            advancedModeCheckBox.CheckedChanged += OnAdvancedModeChanged;
            topBar.Controls.Add(advancedModeCheckBox);

            tabJumpDropdown = new AntDropdown
            {
                Text = "跳转",
                Type = AntdUI.TTypeMini.Default,
                Margin = new Padding(UiScaleHelper.Scale(12), 0, 0, 0),
            };
            tabJumpDropdown.ItemClick += OnTabJumpItemClick;
            topBar.Controls.Add(tabJumpDropdown);

            syncLegendLabel = AntdUiHelper.CreateHintLabel(UiLabels.SyncLegendHint, 900);
            syncLegendLabel.Margin = new Padding(UiScaleHelper.Scale(12), 0, 0, 0);
            topBar.Controls.Add(syncLegendLabel);

            tabs = new AntTabs
            {
                Dock = DockStyle.Fill,
                Type = AntdUI.TabType.Line,
            };
            tabs.SelectedIndexChanged += OnSettingsTabChanged;
            tabs.MouseWheel += OnTabsMouseWheel;

            RegisterTabLazy("概览", () => new ServerOverviewPanel(appServices), false);
            RegisterTabLazy("基本", () => new BasicSettingsPanel(), false);
            RegisterTabLazy("SteamCMD", () => new SteamCmdSettingsPanel(appServices), true);
            RegisterTabLazy("网络", () => new NetworkSettingsPanel(), true, true);
            RegisterTabLazy("安全", () => new SecuritySettingsPanel(), true);
            RegisterTabLazy("性能", () => new PerformanceSettingsPanel(), true);
            RegisterTabLazy("模组", () => new ModSettingsPanel(appServices), false);
            RegisterTabLazy("任务", () => new MissionSettingsPanel(), true);
            RegisterTabLazy("难度", () => new DifficultySettingsPanel(), true);
            RegisterTabLazy("日志", () => new LogSettingsPanel(), true);
            RegisterTabLazy("定时", () => new CronTasksPanel(appServices), true);
            RegisterTabLazy("统计", () => new StatisticsManagementPanel(appServices), true);
            RegisterTabLazy(UiLabels.RemoteControlTab, () => CreateRconPanel(appServices), false);
            RegisterTabLazy("封禁", () => new BansPanel(appServices), false);

            Controls.Add(tabs);
            Controls.Add(topBar);
            Load += OnHostLoad;
            RebuildVisibleTabs();
        }

        private void OnTabsMouseWheel(object sender, MouseEventArgs e)
        {
            if (tabs == null || tabs.Pages == null || tabs.Pages.Count <= 1)
            {
                return;
            }

            if (e == null || e.Delta == 0)
            {
                return;
            }

            int direction;
            if (e.Delta < 0)
            {
                direction = 1;
            }
            else
            {
                direction = -1;
            }

            int selected = tabs.SelectedIndex;
            if (selected < 0)
            {
                selected = 0;
            }

            int next = selected + direction;
            if (next < 0)
            {
                next = 0;
            }
            else if (next >= tabs.Pages.Count)
            {
                next = tabs.Pages.Count - 1;
            }

            if (next != selected)
            {
                tabs.SelectTab(next);
            }
        }

        private void OnTabJumpItemClick(object sender, AntdUI.ObjectNEventArgs e)
        {
            string title = Convert.ToString(e.Value);
            if (string.IsNullOrEmpty(title))
            {
                return;
            }

            SelectTabByTitle(title);
        }

        private RconManagementPanel CreateRconPanel(IAppServices services)
        {
            var panel = new RconManagementPanel(services);
            panel.ConfigSaved += OnExternalPanelConfigSaved;
            return panel;
        }

        private void OnExternalPanelConfigSaved(object sender, EventArgs e)
        {
            if (ExternalConfigSaved != null)
            {
                ExternalConfigSaved(this, EventArgs.Empty);
            }
        }

        public void Bind(ArmaServerConfig config)
        {
            string serverUuid = config != null ? config.ServerUUID : string.Empty;
            if (config != null
                && string.Equals(serverUuid, boundServerUuid, StringComparison.Ordinal)
                && ReferenceEquals(config, currentConfig))
            {
                return;
            }

            currentConfig = config;
            boundServerUuid = serverUuid ?? string.Empty;
            uiSyncedPanels.Clear();
            dirtyTracker.ClearAll();

            if (config == null)
            {
                dirtyTracker.EnterSuppress();
                try
                {
                    foreach (TabDefinition definition in tabDefinitions)
                    {
                        if (definition.SettingsPanel != null)
                        {
                            definition.SettingsPanel.Bind(null);
                        }
                    }
                }
                finally
                {
                    dirtyTracker.ExitSuppress();
                }

                RefreshTabTitles();
                return;
            }

            EnsureActiveTabContentMounted();
            BindActiveTabPanel(forceRefresh: true);
            RefreshActiveTab(tabs.SelectedIndex);
            RefreshTabTitles();
        }

        public void ApplyAll()
        {
            if (currentConfig == null)
            {
                return;
            }

            dirtyTracker.EnterSuppress();
            try
            {
                foreach (IServerSettingsPanel panel in applyPanels)
                {
                    if (!ShouldApplyPanel(panel))
                    {
                        continue;
                    }

                    EnsurePanelReadyForApply(panel);
                    panel.ApplyToModel();
                }
            }
            finally
            {
                dirtyTracker.ExitSuppress();
            }
        }

        public void RefreshOverview()
        {
            if (OverviewPanel != null)
            {
                OverviewPanel.RefreshOverview();
            }
        }

        public void RefreshOverviewFromPoll(ServerRunState runState)
        {
            if (OverviewPanel != null)
            {
                OverviewPanel.RefreshOverviewFromPoll(runState);
            }
        }

        public void ReloadUiSettings()
        {
            advancedModeCheckBox.Checked = AppUiSettings.Instance.ShowAdvancedSettings;
            RebuildVisibleTabs();
        }

        public void ClearDirtyMarkers()
        {
            dirtyTracker.ClearAll();
            RefreshTabTitles();
        }

        public void ClearDirtyMarkersForActiveTab()
        {
            string title = GetActiveTabBaseTitle();
            if (!string.IsNullOrEmpty(title))
            {
                dirtyTracker.ClearTab(title);
            }

            RefreshTabTitles();
        }

        public void UpdateSyncIndicators(ConfigSyncState syncState)
        {
            if (currentSyncState == syncState)
            {
                return;
            }

            currentSyncState = syncState;
            RefreshTabTitles();
        }

        public bool HasLocalEdits()
        {
            return dirtyTracker.HasAnyLocalEdits();
        }

        private void OnDirtyTrackerChanged()
        {
            RefreshTabTitles();
            RaiseSyncIndicatorsChanged();
        }

        private bool ShouldApplyPanel(IServerSettingsPanel panel)
        {
            if (panel == null)
            {
                return false;
            }

            if (dirtyTracker.IsTabLocallyDirty(GetTabTitleForPanel(panel)))
            {
                return true;
            }

            if (panel is IApplyOnlySettingsPanel && uiSyncedPanels.Contains(panel))
            {
                return true;
            }

            return false;
        }

        private void EnsurePanelReadyForApply(IServerSettingsPanel panel)
        {
            if (uiSyncedPanels.Contains(panel))
            {
                return;
            }

            TabDefinition definition = GetTabDefinitionForPanel(panel);
            dirtyTracker.EnterSuppress();
            try
            {
                IApplyOnlySettingsPanel applyOnlyPanel = panel as IApplyOnlySettingsPanel;
                if (applyOnlyPanel != null)
                {
                    applyOnlyPanel.BindForApply(currentConfig);
                }
                else
                {
                    panel.Bind(currentConfig);
                }
            }
            finally
            {
                dirtyTracker.ExitSuppress();
            }

            uiSyncedPanels.Add(panel);
            WireDirtyTrackingIfNeeded(definition);
        }

        private TabDefinition GetTabDefinitionForPanel(IServerSettingsPanel panel)
        {
            foreach (TabDefinition definition in tabDefinitions)
            {
                if (ReferenceEquals(definition.SettingsPanel, panel))
                {
                    return definition;
                }
            }

            return null;
        }

        private string GetTabTitleForPanel(IServerSettingsPanel panel)
        {
            TabDefinition definition = GetTabDefinitionForPanel(panel);
            if (definition == null)
            {
                return string.Empty;
            }

            return definition.Title;
        }

        private void RaiseSyncIndicatorsChanged()
        {
            if (SyncIndicatorsChanged != null)
            {
                SyncIndicatorsChanged(this, EventArgs.Empty);
            }
        }

        private void RegisterTabLazy(string title, Func<Control> contentFactory, bool expertOnly, bool applyLast = false)
        {
            if (contentFactory == null)
            {
                throw new ArgumentNullException(nameof(contentFactory));
            }

            tabDefinitions.Add(new TabDefinition
            {
                Title = title,
                ContentFactory = contentFactory,
                ExpertOnly = expertOnly,
                ApplyLast = applyLast,
            });
        }

        private Control EnsureTabContent(TabDefinition definition)
        {
            if (definition == null)
            {
                return null;
            }

            if (definition.Content != null)
            {
                return definition.Content;
            }

            Control control = definition.ContentFactory();
            if (control is UserControl userControl)
            {
                AppTheme.ApplyTo(userControl);
                userControl.BackColor = System.Drawing.Color.White;
            }

            control.Dock = DockStyle.Fill;
            control.MinimumSize = new System.Drawing.Size(UiScaleHelper.Scale(320), UiScaleHelper.Scale(240));

            definition.Content = control;
            definition.SettingsPanel = control as IServerSettingsPanel;

            if (definition.SettingsPanel != null)
            {
                RegisterApplyPanel(definition, definition.SettingsPanel);
            }

            if (string.Equals(definition.Title, "概览", StringComparison.Ordinal))
            {
                OverviewPanel = control as ServerOverviewPanel;
            }

            return control;
        }

        private void WireDirtyTrackingIfNeeded(TabDefinition definition)
        {
            if (definition == null || definition.Content == null || definition.DirtyTrackingWired)
            {
                return;
            }

            dirtyTracker.RegisterTab(definition.Title, definition.Content);
            definition.DirtyTrackingWired = true;
        }

        private void RegisterApplyPanel(TabDefinition definition, IServerSettingsPanel panel)
        {
            if (definition.ApplyLast)
            {
                applyPanels.Remove(panel);
                applyPanels.Add(panel);
            }
            else
            {
                applyPanels.Add(panel);
            }
        }

        private void EnsureActiveTabContentMounted()
        {
            int index = tabs.SelectedIndex;
            if (index < 0 || index >= visibleTabDefinitions.Count)
            {
                return;
            }

            TabDefinition definition = visibleTabDefinitions[index];
            Control content = EnsureTabContent(definition);
            MountTabContent(tabs.Pages[index], content);
        }

        private static void MountTabContent(AntdUI.TabPage page, Control content)
        {
            if (page == null || content == null)
            {
                return;
            }

            if (page.Controls.Count == 1 && ReferenceEquals(page.Controls[0], content))
            {
                return;
            }

            page.Controls.Clear();
            page.Controls.Add(content);
        }

        private void RebuildVisibleTabs()
        {
            lastSelectedTabTitle = GetSelectedTabBaseTitle();
            tabs.Pages.Clear();
            visibleTabDefinitions.Clear();
            layoutReadyTabs.Clear();

            bool showAdvanced = advancedModeCheckBox.Checked;
            for (int i = 0; i < tabDefinitions.Count; i++)
            {
                TabDefinition definition = tabDefinitions[i];
                if (definition.ExpertOnly && !showAdvanced)
                {
                    continue;
                }

                var page = new AntdUI.TabPage
                {
                    Text = definition.Title,
                    Dock = DockStyle.Fill,
                };
                tabs.Pages.Add(page);
                visibleTabDefinitions.Add(definition);
            }

            RebuildTabJumpMenu();
            SelectTabByTitle(lastSelectedTabTitle);
            if (tabs.SelectedIndex < 0 && tabs.Pages.Count > 0)
            {
                tabs.SelectTab(0);
            }

            EnsureActiveTabContentMounted();
            RefreshActiveTab(tabs.SelectedIndex);
            RefreshTabTitles();
        }

        private void RebuildTabJumpMenu()
        {
            if (tabJumpDropdown == null)
            {
                return;
            }

            tabJumpDropdown.Items.Clear();
            for (int i = 0; i < visibleTabDefinitions.Count; i++)
            {
                TabDefinition definition = visibleTabDefinitions[i];
                if (definition == null || string.IsNullOrEmpty(definition.Title))
                {
                    continue;
                }

                tabJumpDropdown.Items.Add(new AntdUI.SelectItem(definition.Title, definition.Title));
            }
        }

        private string GetSelectedTabBaseTitle()
        {
            int index = tabs.SelectedIndex;
            if (index < 0 || index >= visibleTabDefinitions.Count)
            {
                return StripTabMarker(lastSelectedTabTitle);
            }

            if (index >= tabs.Pages.Count)
            {
                return StripTabMarker(lastSelectedTabTitle);
            }

            return StripTabMarker(tabs.Pages[index].Text ?? lastSelectedTabTitle);
        }

        private void SelectTabByTitle(string title)
        {
            string baseTitle = StripTabMarker(title);
            if (string.IsNullOrEmpty(baseTitle))
            {
                return;
            }

            for (int i = 0; i < tabs.Pages.Count; i++)
            {
                if (string.Equals(StripTabMarker(tabs.Pages[i].Text), baseTitle, StringComparison.Ordinal))
                {
                    tabs.SelectTab(i);
                    return;
                }
            }
        }

        private void OnAdvancedModeChanged(object sender, AntdUI.BoolEventArgs e)
        {
            ApplyAll();
            AppUiSettings.Instance.ShowAdvancedSettings = advancedModeCheckBox.Checked;
            AppUiSettings.Instance.Save(appServices.Paths.ConfigDirectory);
            RebuildVisibleTabs();
            BindActiveTabPanel(forceRefresh: true);
            RefreshTabTitles();
        }

        private void OnHostLoad(object sender, EventArgs e)
        {
            if (tabs.Pages.Count > 0 && tabs.SelectedIndex < 0)
            {
                tabs.SelectTab(0);
            }

            EnsureActiveTabContentMounted();
            RefreshActiveTab(tabs.SelectedIndex);
        }

        private void OnSettingsTabChanged(object sender, AntdUI.IntEventArgs e)
        {
            lastSelectedTabTitle = GetSelectedTabBaseTitle();
            dirtyTracker.EnterSuppress();
            try
            {
                EnsureActiveTabContentMounted();
                BindActiveTabPanel(forceRefresh: false);
                RefreshActiveTab(e.Value);
            }
            finally
            {
                dirtyTracker.ExitSuppress();
            }

            RefreshTabTitles();
            RaiseSyncIndicatorsChanged();
        }

        private void BindActiveTabPanel(bool forceRefresh)
        {
            if (currentConfig == null)
            {
                return;
            }

            int index = tabs.SelectedIndex;
            if (index < 0 || index >= visibleTabDefinitions.Count)
            {
                return;
            }

            TabDefinition definition = visibleTabDefinitions[index];
            EnsureActiveTabContentMounted();

            IServerSettingsPanel panel = definition.SettingsPanel;
            if (panel == null)
            {
                return;
            }

            if (!forceRefresh && uiSyncedPanels.Contains(panel))
            {
                return;
            }

            string tabTitle = definition.Title;
            dirtyTracker.EnterSuppress();
            try
            {
                dirtyTracker.ClearTab(tabTitle);
                panel.Bind(currentConfig);
            }
            finally
            {
                dirtyTracker.ExitSuppress();
            }

            uiSyncedPanels.Add(panel);
            WireDirtyTrackingIfNeeded(definition);
            RefreshTabTitles();
        }

        private IServerSettingsPanel GetActiveSettingsPanel()
        {
            int index = tabs.SelectedIndex;
            if (index < 0 || index >= visibleTabDefinitions.Count)
            {
                return null;
            }

            TabDefinition definition = visibleTabDefinitions[index];
            if (definition.Content == null)
            {
                return null;
            }

            return definition.SettingsPanel;
        }

        private string GetActiveTabBaseTitle()
        {
            int index = tabs.SelectedIndex;
            if (index < 0 || index >= visibleTabDefinitions.Count)
            {
                return string.Empty;
            }

            return visibleTabDefinitions[index].Title;
        }

        private void RefreshTabTitles()
        {
            for (int i = 0; i < tabs.Pages.Count; i++)
            {
                string baseTitle = GetBaseTitleForVisibleIndex(i);
                if (string.IsNullOrEmpty(baseTitle))
                {
                    continue;
                }

                string displayTitle = baseTitle;
                if (dirtyTracker.IsTabLocallyDirty(baseTitle))
                {
                    displayTitle = baseTitle + UiLabels.TabLocalDirtySuffix;
                }
                else if (currentSyncState == ConfigSyncState.SavedToToolOnly
                    && IsUiSyncedPanelForTitle(baseTitle))
                {
                    displayTitle = baseTitle + " ◐";
                }

                tabs.Pages[i].Text = displayTitle;
            }
        }

        private bool IsUiSyncedPanelForTitle(string baseTitle)
        {
            foreach (TabDefinition definition in tabDefinitions)
            {
                if (!string.Equals(definition.Title, baseTitle, StringComparison.Ordinal))
                {
                    continue;
                }

                IServerSettingsPanel panel = definition.SettingsPanel;
                if (panel == null)
                {
                    return false;
                }

                return uiSyncedPanels.Contains(panel);
            }

            return false;
        }

        private string GetBaseTitleForVisibleIndex(int visibleIndex)
        {
            if (visibleIndex < 0 || visibleIndex >= visibleTabDefinitions.Count)
            {
                return string.Empty;
            }

            return visibleTabDefinitions[visibleIndex].Title;
        }

        private static string StripTabMarker(string title)
        {
            if (string.IsNullOrEmpty(title))
            {
                return string.Empty;
            }

            int markerIndex = title.IndexOf(' ');
            if (markerIndex <= 0)
            {
                return title;
            }

            return title.Substring(0, markerIndex);
        }

        private void RefreshActiveTab(int index)
        {
            if (index < 0 || index >= visibleTabDefinitions.Count)
            {
                return;
            }

            TabDefinition definition = visibleTabDefinitions[index];
            Control content = definition.Content;
            if (content == null)
            {
                return;
            }

            if (!layoutReadyTabs.Contains(index))
            {
                content.PerformLayout();
                layoutReadyTabs.Add(index);

                AntdUI.Tabs innerTabs = FindInnerTabs(content);
                if (innerTabs != null && innerTabs.Pages.Count > 0 && innerTabs.SelectedIndex < 0)
                {
                    innerTabs.SelectTab(0);
                }
            }

            content.Invalidate(true);
        }

        private static AntdUI.Tabs FindInnerTabs(Control root)
        {
            foreach (Control child in root.Controls)
            {
                AntdUI.Tabs tabsControl = child as AntdUI.Tabs;
                if (tabsControl != null)
                {
                    return tabsControl;
                }

                AntdUI.Tabs nested = FindInnerTabs(child);
                if (nested != null)
                {
                    return nested;
                }
            }

            return null;
        }
    }
}
