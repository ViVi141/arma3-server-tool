using System;
using System.Drawing;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.App.WinForms.Dialogs;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;
using Microsoft.Extensions.Logging;
using AntButton = AntdUI.Button;
using AntLabel = AntdUI.Label;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class ServerOverviewPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntLabel statusValueLabel;
        private readonly AntLabel pidValueLabel;
        private readonly AntLabel onlineValueLabel;
        private readonly AntLabel hostValueLabel;
        private readonly AntLabel portValueLabel;
        private readonly AntLabel monitoringSummaryLabel;
        private readonly AntLabel scheduleSummaryLabel;
        private readonly AntLabel rptValueLabel;
        private readonly AntButton preflightButton;
        private readonly AntButton rptButton;

        private readonly IAppServices appServices;
        private ArmaServerConfig boundConfig;
        private int refreshGeneration;

        public ServerOverviewPanel(IAppServices appServices)
        {
            this.appServices = appServices;
            AppTheme.ApplyTo(this);

            var layout = SettingsLayoutHelper.CreateFormLayout(120);
            statusValueLabel = AddValueRow(layout, "运行状态", "—");
            pidValueLabel = AddValueRow(layout, "进程 PID", "—");
            onlineValueLabel = AddValueRow(layout, "在线人数", "—");
            hostValueLabel = AddValueRow(layout, "主机名", "—");
            portValueLabel = AddValueRow(layout, "游戏端口", "—");
            monitoringSummaryLabel = AddValueRow(layout, "监控 / 统计", "—");
            scheduleSummaryLabel = AddValueRow(layout, "定时 / 重启", "—");
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
                "概览页显示当前选中服务器的状态。运行中会通过 RCon 尝试刷新在线人数；"
                + "监控与定时摘要可在「统计」「定时」Tab 中配置。",
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

            refreshGeneration++;
            int generation = refreshGeneration;

            ServerRunState state = appServices.ProcessService.SyncState(boundConfig.ServerUUID);
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

            if (state == ServerRunState.Running)
            {
                onlineValueLabel.Text = "查询中…";
                BeginRefreshOnlineCount(generation);
            }
            else
            {
                onlineValueLabel.Text = "—";
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
            monitoringSummaryLabel.Text = ServerOperationsSummaryBuilder.BuildMonitoringLine(boundConfig);
            BeginRefreshScheduleSummary(generation);

            string rptPath = appServices.RptLogService.FindLatestRptPath(boundConfig);
            if (string.IsNullOrEmpty(rptPath))
            {
                rptValueLabel.Text = "未找到";
            }
            else
            {
                rptValueLabel.Text = System.IO.Path.GetFileName(rptPath);
            }
        }

        private async void BeginRefreshOnlineCount(int generation)
        {
            ArmaServerConfig config = boundConfig;
            if (config == null)
            {
                return;
            }

            string host = config.BattlEyeConfig.RConHost;
            if (string.IsNullOrWhiteSpace(host))
            {
                host = "127.0.0.1";
            }

            int? count = await appServices.RconQuickProbe.TryGetOnlinePlayerCountAsync(
                host,
                config.BattlEyeConfig.RConPort,
                config.BattlEyeConfig.RConPassword,
                CancellationToken.None).ConfigureAwait(true);

            if (generation != refreshGeneration || boundConfig != config)
            {
                return;
            }

            if (count.HasValue)
            {
                onlineValueLabel.Text = count.Value.ToString() + " 人（RCon）";
            }
            else
            {
                onlineValueLabel.Text = "不可用（需 BattlEye + RCon 密码）";
            }
        }

        private async void BeginRefreshScheduleSummary(int generation)
        {
            ArmaServerConfig config = boundConfig;
            if (config == null)
            {
                return;
            }

            string nextFire = string.Empty;
            try
            {
                nextFire = await appServices.SchedulerService
                    .GetNextFireSummaryAsync(config.ServerUUID)
                    .ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                AppLogging.CreateLogger("ServerOverviewPanel")
                    .LogDebug(ex, "Failed to load scheduler summary.");
            }

            if (generation != refreshGeneration || boundConfig != config)
            {
                return;
            }

            scheduleSummaryLabel.Text = ServerOperationsSummaryBuilder.BuildCronLine(config, nextFire);
        }

        private void ClearValues()
        {
            statusValueLabel.Text = "—";
            pidValueLabel.Text = "—";
            onlineValueLabel.Text = "—";
            hostValueLabel.Text = "—";
            portValueLabel.Text = "—";
            monitoringSummaryLabel.Text = "—";
            scheduleSummaryLabel.Text = "—";
            rptValueLabel.Text = "—";
        }

        private void OnRunPreflight(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            ServerRunState state = appServices.ProcessService.GetState(boundConfig.ServerUUID);
            var items = appServices.PreflightChecker.Check(boundConfig, state);
            using (var dialog = new PreflightReportForm(items, false))
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

            string path = appServices.RptLogService.FindLatestRptPath(boundConfig);
            if (string.IsNullOrEmpty(path))
            {
                AntdUiHelper.ShowInfo(FindForm(), "未找到 RPT 日志文件。请先启动服务器或确认配置目录。", "提示");
                return;
            }

            using (var dialog = new RptLogViewerForm(path, appServices.RptLogService))
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
