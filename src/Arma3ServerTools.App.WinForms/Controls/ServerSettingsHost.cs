using System;
using System.Collections.Generic;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Core.Models;
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
        private readonly List<TabDefinition> tabDefinitions = new List<TabDefinition>();
        private readonly List<IServerSettingsPanel> applyPanels = new List<IServerSettingsPanel>();
        private readonly List<Control> tabContents = new List<Control>();
        private readonly HashSet<int> layoutReadyTabs = new HashSet<int>();
        private string lastSelectedTabTitle = "概览";

        public ServerOverviewPanel OverviewPanel { get; private set; }

        public ServerSettingsHost(IAppServices appServices)
        {
            this.appServices = appServices;
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
            RegisterTab(UiLabels.RemoteControlTab, new RconManagementPanel(appServices), false);
            RegisterTab("封禁", new BansPanel(appServices), false);

            Controls.Add(tabs);
            Controls.Add(topBar);
            Load += OnHostLoad;
            RebuildVisibleTabs();
        }

        public void Bind(ArmaServerConfig config)
        {
            foreach (IServerSettingsPanel panel in applyPanels)
            {
                panel.Bind(config);
            }

            RefreshActiveTab(tabs.SelectedIndex);
        }

        public void ApplyAll()
        {
            foreach (IServerSettingsPanel panel in applyPanels)
            {
                panel.ApplyToModel();
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
            lastSelectedTabTitle = GetSelectedTabTitle();
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
        }

        private string GetSelectedTabTitle()
        {
            int index = tabs.SelectedIndex;
            if (index < 0 || index >= tabs.Pages.Count)
            {
                return lastSelectedTabTitle;
            }

            return tabs.Pages[index].Text ?? lastSelectedTabTitle;
        }

        private void SelectTabByTitle(string title)
        {
            if (string.IsNullOrEmpty(title))
            {
                return;
            }

            for (int i = 0; i < tabs.Pages.Count; i++)
            {
                if (string.Equals(tabs.Pages[i].Text, title, StringComparison.Ordinal))
                {
                    tabs.SelectTab(i);
                    return;
                }
            }
        }

        private void OnAdvancedModeChanged(object sender, AntdUI.BoolEventArgs e)
        {
            AppUiSettings.Instance.ShowAdvancedSettings = advancedModeCheckBox.Checked;
            AppUiSettings.Instance.Save(appServices.Paths.ConfigDirectory);
            RebuildVisibleTabs();
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
            lastSelectedTabTitle = GetSelectedTabTitle();
            RefreshActiveTab(e.Value);
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
