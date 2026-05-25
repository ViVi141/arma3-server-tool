using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Application.Sync;
using Arma3ServerTools.Core.Models;
using AntLabel = AntdUI.Label;
using AntTabs = AntdUI.Tabs;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class ServerSettingsHost : UserControl
    {
        private sealed class TabDefinition
        {
            public string Title { get; set; } = string.Empty;

            public Control Content { get; set; }

            public IServerSettingsPanel SettingsPanel { get; set; }

            public bool ExpertOnly { get; set; }

            public bool ApplyLast { get; set; }
        }

        private readonly IAppServices appServices;
        private readonly AntTabs tabs;
        private readonly AntdUI.Checkbox advancedModeCheckBox;
        private readonly AntLabel syncLegendLabel;
        private readonly SettingsDirtyTracker dirtyTracker;
        private readonly List<TabDefinition> tabDefinitions = new List<TabDefinition>();
        private readonly List<IServerSettingsPanel> applyPanels = new List<IServerSettingsPanel>();
        private readonly List<Control> tabContents = new List<Control>();
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

            syncLegendLabel = AntdUiHelper.CreateHintLabel(UiLabels.SyncLegendHint, 900);
            syncLegendLabel.Margin = new Padding(UiScaleHelper.Scale(12), 0, 0, 0);
            topBar.Controls.Add(syncLegendLabel);

            tabs = new AntTabs
            {
                Dock = DockStyle.Fill,
                Type = AntdUI.TabType.Line,
            };
            tabs.SelectedIndexChanged += OnSettingsTabChanged;

            OverviewPanel = RegisterTab("概览", new ServerOverviewPanel(appServices), false);
            RegisterTab("基本", new BasicSettingsPanel(), false);
            RegisterTab("SteamCMD", new SteamCmdSettingsPanel(appServices), true);
            RegisterTab("网络", new NetworkSettingsPanel(), true, true);
            RegisterTab("安全", new SecuritySettingsPanel(), true);
            RegisterTab("性能", new PerformanceSettingsPanel(), true);
            RegisterTab("模组", new ModSettingsPanel(appServices), false);
            RegisterTab("任务", new MissionSettingsPanel(), true);
            RegisterTab("难度", new DifficultySettingsPanel(), true);
            RegisterTab("日志", new LogSettingsPanel(), true);
            RegisterTab("定时", new CronTasksPanel(appServices), true);
            RegisterTab("统计", new StatisticsManagementPanel(appServices), true);
            RegisterTab(UiLabels.RemoteControlTab, CreateRconPanel(appServices), false);
            RegisterTab("封禁", new BansPanel(appServices), false);

            Controls.Add(tabs);
            Controls.Add(topBar);
            Load += OnHostLoad;
            RebuildVisibleTabs();
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
                    foreach (IServerSettingsPanel panel in applyPanels)
                    {
                        panel.Bind(null);
                    }
                }
                finally
                {
                    dirtyTracker.ExitSuppress();
                }

                RefreshTabTitles();
                return;
            }

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
                    if (!uiSyncedPanels.Contains(panel))
                    {
                        panel.Bind(currentConfig);
                        uiSyncedPanels.Add(panel);
                    }

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

        private void RaiseSyncIndicatorsChanged()
        {
            if (SyncIndicatorsChanged != null)
            {
                SyncIndicatorsChanged(this, EventArgs.Empty);
            }
        }

        private T RegisterTab<T>(string title, T control, bool expertOnly, bool applyLast = false) where T : Control
        {
            if (control is UserControl userControl)
            {
                AppTheme.ApplyTo(userControl);
                userControl.BackColor = System.Drawing.Color.White;
            }

            control.Dock = DockStyle.Fill;
            control.MinimumSize = new System.Drawing.Size(UiScaleHelper.Scale(320), UiScaleHelper.Scale(240));

            IServerSettingsPanel settingsPanel = control as IServerSettingsPanel;
            tabDefinitions.Add(new TabDefinition
            {
                Title = title,
                Content = control,
                SettingsPanel = settingsPanel,
                ExpertOnly = expertOnly,
                ApplyLast = applyLast,
            });

            dirtyTracker.RegisterTab(title, control);

            if (settingsPanel != null)
            {
                if (applyLast)
                {
                    applyPanels.Remove(settingsPanel);
                    applyPanels.Add(settingsPanel);
                }
                else
                {
                    applyPanels.Add(settingsPanel);
                }
            }

            return control;
        }

        private void RebuildVisibleTabs()
        {
            lastSelectedTabTitle = GetSelectedTabBaseTitle();
            tabs.Pages.Clear();
            tabContents.Clear();
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
                page.Controls.Add(definition.Content);
                tabs.Pages.Add(page);
                tabContents.Add(definition.Content);
            }

            SelectTabByTitle(lastSelectedTabTitle);
            if (tabs.SelectedIndex < 0 && tabs.Pages.Count > 0)
            {
                tabs.SelectTab(0);
            }

            RefreshActiveTab(tabs.SelectedIndex);
            RefreshTabTitles();
        }

        private string GetSelectedTabBaseTitle()
        {
            int index = tabs.SelectedIndex;
            if (index < 0 || index >= tabContents.Count)
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

            RefreshActiveTab(tabs.SelectedIndex);
        }

        private void OnSettingsTabChanged(object sender, AntdUI.IntEventArgs e)
        {
            lastSelectedTabTitle = GetSelectedTabBaseTitle();
            BindActiveTabPanel(forceRefresh: false);
            RefreshActiveTab(e.Value);
            RefreshTabTitles();
        }

        private void BindActiveTabPanel(bool forceRefresh)
        {
            if (currentConfig == null)
            {
                return;
            }

            IServerSettingsPanel panel = GetActiveSettingsPanel();
            if (panel == null)
            {
                return;
            }

            if (!forceRefresh && uiSyncedPanels.Contains(panel))
            {
                return;
            }

            string tabTitle = GetActiveTabBaseTitle();
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
            RefreshTabTitles();
        }

        private IServerSettingsPanel GetActiveSettingsPanel()
        {
            int index = tabs.SelectedIndex;
            if (index < 0 || index >= tabContents.Count)
            {
                return null;
            }

            return tabContents[index] as IServerSettingsPanel;
        }

        private string GetActiveTabBaseTitle()
        {
            int index = tabs.SelectedIndex;
            if (index < 0 || index >= tabContents.Count)
            {
                return string.Empty;
            }

            Control content = tabContents[index];
            foreach (TabDefinition definition in tabDefinitions)
            {
                if (ReferenceEquals(definition.Content, content))
                {
                    return definition.Title;
                }
            }

            return string.Empty;
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
            if (visibleIndex < 0 || visibleIndex >= tabContents.Count)
            {
                return string.Empty;
            }

            Control content = tabContents[visibleIndex];
            foreach (TabDefinition definition in tabDefinitions)
            {
                if (ReferenceEquals(definition.Content, content))
                {
                    return definition.Title;
                }
            }

            return string.Empty;
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
            if (index < 0 || index >= tabContents.Count)
            {
                return;
            }

            Control content = tabContents[index];
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
