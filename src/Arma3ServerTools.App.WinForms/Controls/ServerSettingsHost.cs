using System.Collections.Generic;
using System.Windows.Forms;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class ServerSettingsHost : TabControl
    {
        private readonly List<IServerSettingsPanel> panels = new List<IServerSettingsPanel>();

        public ServerSettingsHost()
        {
            Dock = DockStyle.Fill;

            AddTab("基本", new BasicSettingsPanel());
            NetworkSettingsPanel networkPanel = AddTab("网络", new NetworkSettingsPanel());
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

            // 简易网络模式会写入 LimitFPS，需在性能页之后应用。
            panels.Remove(networkPanel);
            panels.Add(networkPanel);
        }

        public void Bind(ArmaServerConfig config)
        {
            foreach (IServerSettingsPanel panel in panels)
            {
                panel.Bind(config);
            }
        }

        public void ApplyAll()
        {
            foreach (IServerSettingsPanel panel in panels)
            {
                panel.ApplyToModel();
            }
        }

        private T AddTab<T>(string title, T control) where T : Control
        {
            var page = new TabPage(title)
            {
                Padding = new Padding(4),
            };
            control.Dock = DockStyle.Fill;
            page.Controls.Add(control);
            TabPages.Add(page);

            IServerSettingsPanel settingsPanel = control as IServerSettingsPanel;
            if (settingsPanel != null)
            {
                panels.Add(settingsPanel);
            }

            return control;
        }
    }
}
