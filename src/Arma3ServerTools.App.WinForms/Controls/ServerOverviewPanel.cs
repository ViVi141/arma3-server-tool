using System;
using System.Drawing;
using System.Windows.Forms;
using AntButton = AntdUI.Button;
using AntLabel = AntdUI.Label;
using AntPanel = AntdUI.Panel;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class ServerOverviewPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntLabel statusValueLabel;
        private readonly AntLabel pidValueLabel;
        private readonly AntLabel hostValueLabel;
        private readonly AntLabel portValueLabel;
        private readonly AntLabel rptValueLabel;
        private readonly AntButton preflightButton;
        private readonly AntButton rptButton;

        private ArmaServerConfig boundConfig;

        public ServerOverviewPanel()
        {
            AppTheme.ApplyTo(this);

            var layout = SettingsLayoutHelper.CreateFormLayout(120);
            statusValueLabel = AddValueRow(layout, "运行状态", "—");
            pidValueLabel = AddValueRow(layout, "进程 PID", "—");
            hostValueLabel = AddValueRow(layout, "主机名", "—");
            portValueLabel = AddValueRow(layout, "游戏端口", "—");
            rptValueLabel = AddValueRow(layout, "最新 RPT", "—");

            var toolbar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(0, UiScaleHelper.Scale(8), 0, 0),
            };
            preflightButton = SettingsLayoutHelper.CreateButton("启动前检查");
            rptButton = SettingsLayoutHelper.CreateButton("查看 RPT 日志");
            AntButton aboutButton = SettingsLayoutHelper.CreateButton("关于");
            preflightButton.Click += OnRunPreflight;
            rptButton.Click += OnViewRpt;
            aboutButton.Click += OnOpenAbout;
            toolbar.Controls.Add(preflightButton);
            toolbar.Controls.Add(rptButton);
            toolbar.Controls.Add(aboutButton);

            AntLabel hint = AntdUiHelper.CreateHintLabel(
                "概览页显示当前选中服务器的状态。启动前建议运行检查；运行中可在 RPT 中查看错误信息。",
                640);
            hint.Dock = DockStyle.Top;

            Controls.Add(SettingsLayoutHelper.CreateScrollHost(layout));
            Controls.Add(toolbar);
            Controls.Add(hint);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            if (config == null)
            {
                Enabled = false;
                ClearValues();
                return;
            }

            Enabled = true;
            RefreshOverview();
        }

        public void ApplyToModel()
        {
        }

        public void RefreshOverview()
        {
            if (boundConfig == null)
            {
                ClearValues();
                return;
            }

            ServerRunState state = AppServices.Instance.ProcessService.SyncState(boundConfig.ServerUUID);
            statusValueLabel.Text = ServerRunStateFormatter.ToDisplay(state);

            int pid = boundConfig.ServerTaskManagement.ProcessById;
            if (pid > 0 && state == ServerRunState.Running)
            {
                pidValueLabel.Text = pid.ToString();
            }
            else
            {
                pidValueLabel.Text = "—";
            }

            string hostName = boundConfig.ServerConfig.HostName;
            if (string.IsNullOrWhiteSpace(hostName))
            {
                hostValueLabel.Text = "（未设置）";
            }
            else
            {
                hostValueLabel.Text = hostName;
            }

            portValueLabel.Text = boundConfig.StartupParameters.Port.ToString();

            string rptPath = AppServices.Instance.RptLogService.FindLatestRptPath(boundConfig);
            if (string.IsNullOrEmpty(rptPath))
            {
                rptValueLabel.Text = "未找到";
            }
            else
            {
                rptValueLabel.Text = System.IO.Path.GetFileName(rptPath);
            }
        }

        private void ClearValues()
        {
            statusValueLabel.Text = "—";
            pidValueLabel.Text = "—";
            hostValueLabel.Text = "—";
            portValueLabel.Text = "—";
            rptValueLabel.Text = "—";
        }

        private void OnRunPreflight(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            ServerRunState state = AppServices.Instance.ProcessService.GetState(boundConfig.ServerUUID);
            var items = AppServices.Instance.PreflightChecker.Check(boundConfig, state);
            using (var dialog = new Dialogs.PreflightReportForm(items, false))
            {
                dialog.ShowDialog(FindForm());
            }
        }

        private void OnViewRpt(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            string path = AppServices.Instance.RptLogService.FindLatestRptPath(boundConfig);
            if (string.IsNullOrEmpty(path))
            {
                AntdUiHelper.ShowInfo(FindForm(), "未找到 RPT 日志文件。请先启动服务器或确认配置目录。", "提示");
                return;
            }

            using (var dialog = new Dialogs.RptLogViewerForm(path, AppServices.Instance.RptLogService))
            {
                dialog.ShowDialog(FindForm());
            }
        }

        private void OnOpenAbout(object sender, EventArgs e)
        {
            using (var dialog = new AboutForm())
            {
                dialog.ShowDialog(FindForm());
            }
        }

        private static AntLabel AddValueRow(TableLayoutPanel layout, string caption, string initialValue)
        {
            var valueLabel = new AntLabel
            {
                Text = initialValue,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
            };
            SettingsLayoutHelper.AddRow(layout, caption, valueLabel);
            return valueLabel;
        }
    }
}
