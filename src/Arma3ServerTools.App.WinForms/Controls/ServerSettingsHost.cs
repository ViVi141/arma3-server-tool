using System.Collections.Generic;
using System.Windows.Forms;
using Arma3ServerTools.Core.Models;
using AntTabs = AntdUI.Tabs;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class ServerSettingsHost : UserControl
    {
        private readonly AntTabs tabs;
        private readonly List<IServerSettingsPanel> panels = new List<IServerSettingsPanel>();
        private readonly List<Control> tabContents = new List<Control>();
        private readonly HashSet<int> layoutReadyTabs = new HashSet<int>();

        public ServerSettingsHost()
        {
            Dock = DockStyle.Fill;
            BackColor = System.Drawing.Color.White;
            tabs = new AntTabs
            {
                Dock = DockStyle.Fill,
                Type = AntdUI.TabType.Line,
            };
            tabs.SelectedIndexChanged += OnSettingsTabChanged;

            NetworkSettingsPanel networkPanel = AddTab("网络", new NetworkSettingsPanel());
            AddTab("基本", new BasicSettingsPanel());
            AddTab("安全", new SecuritySettingsPanel());
            AddTab("性能", new PerformanceSettingsPanel());
            AddTab("日志", new LogSettingsPanel());
            AddTab("难度", new DifficultySettingsPanel());
            AddTab("模组", new ModSettingsPanel());
            AddTab("任务", new MissionSettingsPanel());
            AddTab("定时", new CronTasksPanel());
            AddTab("统计", new StatisticsManagementPanel());
            AddTab("RCon", new RconManagementPanel());
            AddTab("封禁", new BansPanel());

            panels.Remove(networkPanel);
            panels.Add(networkPanel);

            Controls.Add(tabs);
            Load += OnHostLoad;
        }

        public void Bind(ArmaServerConfig config)
        {
            foreach (IServerSettingsPanel panel in panels)
            {
                panel.Bind(config);
            }

            RefreshActiveTab(tabs.SelectedIndex);
        }

        public void ApplyAll()
        {
            foreach (IServerSettingsPanel panel in panels)
            {
                panel.ApplyToModel();
            }
        }

        private void OnHostLoad(object sender, System.EventArgs e)
        {
            if (tabs.Pages.Count > 0)
            {
                tabs.SelectTab(0);
            }

            RefreshActiveTab(tabs.SelectedIndex);
        }

        private void OnSettingsTabChanged(object sender, AntdUI.IntEventArgs e)
        {
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

        private T AddTab<T>(string title, T control) where T : Control
        {
            if (control is UserControl userControl)
            {
                AppTheme.ApplyTo(userControl);
                userControl.BackColor = System.Drawing.Color.White;
            }

            control.Dock = DockStyle.Fill;
            control.MinimumSize = new System.Drawing.Size(UiScaleHelper.Scale(320), UiScaleHelper.Scale(240));

            var page = new AntdUI.TabPage
            {
                Text = title,
                Dock = DockStyle.Fill,
            };
            page.Controls.Add(control);
            tabs.Pages.Add(page);
            tabContents.Add(control);

            IServerSettingsPanel settingsPanel = control as IServerSettingsPanel;
            if (settingsPanel != null)
            {
                panels.Add(settingsPanel);
            }

            return control;
        }
    }
}
