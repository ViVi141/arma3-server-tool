using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using AntLabel = AntdUI.Label;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class StatisticsPlayerStatRow
    {
        public string PlayerId { get; set; } = string.Empty;

        public string Name { get; set; } = string.Empty;

        public int Infantry { get; set; }

        public int Soft { get; set; }

        public int Armor { get; set; }

        public int Air { get; set; }

        public int Deaths { get; set; }

        public int Score { get; set; }

        public int Online { get; set; }

        public string Time { get; set; } = string.Empty;
    }

    internal sealed class StatisticsObjectStatRow
    {
        public string Id { get; set; } = string.Empty;

        public string Players { get; set; } = string.Empty;

        public string Units { get; set; } = string.Empty;

        public string Fps { get; set; } = string.Empty;

        public string FpsMin { get; set; } = string.Empty;

        public string Time { get; set; } = string.Empty;
    }

    internal sealed class StatisticsPlayerDirectoryRow
    {
        public string Guid { get; set; } = string.Empty;

        public string Name { get; set; } = string.Empty;

        public string Ip { get; set; } = string.Empty;

        public string LastSeen { get; set; } = string.Empty;
    }

    internal sealed class StatisticsManagementPanel : UserControl, IApplyOnlySettingsPanel
    {
        private readonly AntTable playerStatsTable;
        private readonly AntTable objectStatsTable;
        private readonly AntTable playerDirectoryTable;
        private readonly AntLabel summaryLabel;
        private readonly AntLabel emptyDataGuideLabel;
        private readonly AntLabel healthResultLabel;
        private readonly AntdUI.Checkbox enableMonitorCheckBox;
        private readonly AntdUI.Checkbox enableMonitoringServiceCheckBox;
        private readonly StatisticsChartsPanel chartsPanel;

        private readonly IAppServices appServices;
        private ArmaServerConfig boundConfig;
        private readonly System.Collections.Generic.List<StatisticsPlayerStatRow> playerStatRows = new System.Collections.Generic.List<StatisticsPlayerStatRow>();
        private readonly System.Collections.Generic.List<StatisticsObjectStatRow> objectStatRows = new System.Collections.Generic.List<StatisticsObjectStatRow>();
        private readonly System.Collections.Generic.List<StatisticsPlayerDirectoryRow> directoryRows = new System.Collections.Generic.List<StatisticsPlayerDirectoryRow>();
        private int refreshVersion;

        public StatisticsManagementPanel(IAppServices appServices)
        {
            this.appServices = appServices;
            AppTheme.ApplyTo(this);

            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            AntdUI.Button refreshButton = SettingsLayoutHelper.CreateButton("刷新统计");
            AntdUI.Button initOnlineButton = SettingsLayoutHelper.CreateButton("重置在线状态");
            AntdUI.Button cleanupButton = SettingsLayoutHelper.CreateButton("清理一月前快照");
            AntdUI.Button exportCsvButton = SettingsLayoutHelper.CreateButton("导出 CSV...");
            AntdUI.Button exportHtmlButton = SettingsLayoutHelper.CreateButton("导出 HTML 日报...");
            refreshButton.Click += delegate { RefreshAll(); };
            initOnlineButton.Click += OnInitOnline;
            cleanupButton.Click += OnCleanupOldData;
            exportCsvButton.Click += OnExportCsv;
            exportHtmlButton.Click += OnExportHtmlReport;
            exportHtmlButton.Click += OnExportHtmlReport;
            toolbar.Controls.Add(refreshButton);
            toolbar.Controls.Add(initOnlineButton);
            toolbar.Controls.Add(cleanupButton);
            toolbar.Controls.Add(exportCsvButton);
            toolbar.Controls.Add(exportHtmlButton);

            var monitoringOptionsBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(4)),
            };
            enableMonitorCheckBox = SettingsLayoutHelper.CreateCheckbox(
                "启用监控模组 (" + ToolConstants.MonitoringServerModToken + ")",
                false);
            enableMonitoringServiceCheckBox = SettingsLayoutHelper.CreateCheckbox(
                "启用统计入库 (" + ToolConstants.StatisticsDatabaseFileName + ")",
                false);
            enableMonitorCheckBox.Margin = new Padding(0, UiScaleHelper.Scale(4), UiScaleHelper.Scale(16), 0);
            enableMonitoringServiceCheckBox.Margin = new Padding(0, UiScaleHelper.Scale(4), 0, 0);
            monitoringOptionsBar.Controls.Add(enableMonitorCheckBox);
            monitoringOptionsBar.Controls.Add(enableMonitoringServiceCheckBox);

            var healthBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(4)),
            };
            AntdUI.Button healthCheckButton = SettingsLayoutHelper.CreateButton("检测监控组件");
            healthCheckButton.Click += OnRunHealthCheck;
            healthBar.Controls.Add(healthCheckButton);

            healthResultLabel = new AntLabel
            {
                Dock = DockStyle.Top,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(4)),
                Text = string.Empty,
                Visible = false,
            };

            emptyDataGuideLabel = AntdUiHelper.CreateHintLabel(
                "暂无统计数据。请逐项排查："
                + Environment.NewLine
                + "1. 在本页勾选「启用监控模组」与「启用统计入库」，并保存到工具后「应用到服务器目录」。"
                + Environment.NewLine
                + "2. 启动服务器；统计入库需 MonitoringHost 在后台运行（启动服务器时自动拉起）。"
                + Environment.NewLine
                + "3. 确认任务模组已加载，且地图运行一段时间后点击「刷新统计」。"
                + Environment.NewLine
                + "4. 点击「检测监控组件」确认 DLL、模组与入库宿主就绪。",
                720);
            emptyDataGuideLabel.Dock = DockStyle.Top;
            emptyDataGuideLabel.Visible = false;

            summaryLabel = new AntLabel
            {
                Dock = DockStyle.Top,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(0, UiScaleHelper.Scale(8), 0, UiScaleHelper.Scale(8)),
                Text = "选择服务器后点击刷新统计",
            };

            var tabs = AntdUiHelper.CreateTabsPanel();
            playerStatsTable = CreateStatsTable(
                new AntdTableHelper.ColumnSpec("PlayerId", "玩家 ID", "8%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Name", "昵称", "14%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Infantry", "步兵击杀", "7%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Soft", "软目标", "7%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Armor", "装甲", "7%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Air", "空中", "7%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Deaths", "死亡", "7%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Score", "得分", "9%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Online", "在线", "8%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Time", "时间", "26%", AntdUI.ColumnAlign.Left));
            objectStatsTable = CreateStatsTable(
                new AntdTableHelper.ColumnSpec("Id", "快照 ID", "12%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Players", "玩家数", "15%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Units", "单位数", "15%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Fps", "帧率", "12%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("FpsMin", "最低帧率", "14%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Time", "时间", "32%", AntdUI.ColumnAlign.Left));
            playerDirectoryTable = CreateStatsTable(
                new AntdTableHelper.ColumnSpec("Guid", "Steam GUID", "28%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Name", "昵称", "24%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Ip", "IP 地址", "18%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("LastSeen", "最后上线", "30%", AntdUI.ColumnAlign.Left));

            chartsPanel = new StatisticsChartsPanel();

            AntdUiHelper.AddTabPage(tabs, "趋势图表", chartsPanel);
            AntdUiHelper.AddTabPage(tabs, "服务器快照", objectStatsTable);
            AntdUiHelper.AddTabPage(tabs, "战斗统计", playerStatsTable);
            AntdUiHelper.AddTabPage(tabs, "玩家库", playerDirectoryTable);

            Controls.Add(tabs);
            Controls.Add(emptyDataGuideLabel);
            Controls.Add(healthResultLabel);
            Controls.Add(healthBar);
            Controls.Add(monitoringOptionsBar);
            Controls.Add(summaryLabel);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            playerStatRows.Clear();
            objectStatRows.Clear();
            directoryRows.Clear();
            AntdTableHelper.BindList(playerStatsTable, playerStatRows);
            AntdTableHelper.BindList(objectStatsTable, objectStatRows);
            AntdTableHelper.BindList(playerDirectoryTable, directoryRows);
            if (config == null)
            {
                Enabled = false;
                summaryLabel.Text = "未选择服务器";
                emptyDataGuideLabel.Visible = false;
                healthResultLabel.Visible = false;
                return;
            }

            Enabled = true;
            enableMonitorCheckBox.Checked = config.ServerTaskManagement.EnableMonitor;
            enableMonitoringServiceCheckBox.Checked = config.ServerTaskManagement.EnableMonitoringService;
            summaryLabel.Text = "统计: " + config.ConfigName;
            RefreshAll();
        }

        public void BindForApply(ArmaServerConfig config)
        {
            boundConfig = config;
            if (config == null)
            {
                Enabled = false;
                summaryLabel.Text = "未选择服务器";
                return;
            }

            Enabled = true;
            enableMonitorCheckBox.Checked = config.ServerTaskManagement.EnableMonitor;
            enableMonitoringServiceCheckBox.Checked = config.ServerTaskManagement.EnableMonitoringService;
            summaryLabel.Text = "统计: " + config.ConfigName;
        }

        public void ApplyToModel()
        {
            if (boundConfig == null)
            {
                return;
            }

            boundConfig.ServerTaskManagement.EnableMonitor = enableMonitorCheckBox.Checked;
            boundConfig.ServerTaskManagement.EnableMonitoringService = enableMonitoringServiceCheckBox.Checked;
        }

        private void OnRunHealthCheck(object sender, EventArgs e)
        {
            MonitoringHealthChecker checker = appServices.MonitoringHealthChecker;
            IReadOnlyList<MonitoringHealthItem> items = checker.Check(boundConfig);

            bool hostRunning = MonitoringHostLauncher.IsHostRunning();
            var builder = new System.Text.StringBuilder();
            foreach (MonitoringHealthItem item in items)
            {
                string prefix;
                if (item.IsOk)
                {
                    prefix = "[正常] ";
                }
                else
                {
                    prefix = "[异常] ";
                }

                builder.AppendLine(prefix + item.Title);
                builder.AppendLine("  " + item.Detail);
            }

            if (hostRunning)
            {
                builder.AppendLine("[正常] 统计入库宿主进程");
                builder.AppendLine("  监控宿主窗口已在运行。");
            }
            else
            {
                builder.AppendLine("[提示] 统计入库宿主进程");
                builder.AppendLine("  当前未运行；启动服务器且启用统计入库时会自动拉起。");
            }

            healthResultLabel.Text = builder.ToString().TrimEnd();
            healthResultLabel.Visible = true;
        }

        private void UpdateEmptyDataGuide(bool hasData)
        {
            emptyDataGuideLabel.Visible = boundConfig != null && !hasData;
        }

        private async void RefreshAll()
        {
            await RefreshAllAsync().ConfigureAwait(true);
        }

        private async Task RefreshAllAsync()
        {
            if (boundConfig == null)
            {
                return;
            }

            int currentVersion = Interlocked.Increment(ref refreshVersion);
            string targetServerUuid = boundConfig.ServerUUID;
                summaryLabel.Text = "统计: " + targetServerUuid + " - 正在刷新...";

            try
            {
                StatisticsRefreshResult refreshResult = await Task.Run(
                    delegate
                    {
                        return BuildRefreshResult(targetServerUuid);
                    }).ConfigureAwait(true);

                if (IsDisposed)
                {
                    return;
                }

                if (currentVersion != refreshVersion)
                {
                    return;
                }

                if (boundConfig == null || !string.Equals(boundConfig.ServerUUID, targetServerUuid, StringComparison.Ordinal))
                {
                    return;
                }

                List<MonitoringPlayerStatRecord> playerRecords = refreshResult.PlayerRecords;
                playerStatRows.Clear();
                foreach (MonitoringPlayerStatRecord row in playerRecords)
                {
                    playerStatRows.Add(
                        new StatisticsPlayerStatRow
                        {
                            PlayerId = row.PlayerId,
                            Name = row.PlayerName,
                            Infantry = row.InfantryKills,
                            Soft = row.SoftVehicleKills,
                            Armor = row.ArmorKills,
                            Air = row.AirKills,
                            Deaths = row.Deaths,
                            Score = row.TotalScore,
                            Online = row.Online,
                            Time = row.CreateTime,
                        });
                }

                AntdTableHelper.BindList(playerStatsTable, playerStatRows);

                List<MonitoringObjectStatRecord> objectRecords = refreshResult.ObjectRecords;
                objectStatRows.Clear();
                foreach (MonitoringObjectStatRecord row in objectRecords)
                {
                    objectStatRows.Add(
                        new StatisticsObjectStatRow
                        {
                            Id = row.Id.ToString(),
                            Players = row.AllPlayers.ToString(),
                            Units = row.AllUnits.ToString(),
                            Fps = row.Fps.ToString(),
                            FpsMin = row.FpsMin.ToString(),
                            Time = row.CreateTime,
                        });
                }

                AntdTableHelper.BindList(objectStatsTable, objectStatRows);

                List<MonitoringObjectStatRecord> timelineRecords = refreshResult.TimelineRecords;
                chartsPanel.RenderCharts(timelineRecords, playerRecords);

                directoryRows.Clear();
                foreach (PlayerDB player in refreshResult.DirectoryRecords)
                {
                    directoryRows.Add(
                        new StatisticsPlayerDirectoryRow
                        {
                            Guid = player.Guid,
                            Name = player.Name,
                            Ip = player.Ip,
                            LastSeen = player.Time,
                        });
                }

                AntdTableHelper.BindList(playerDirectoryTable, directoryRows);

                bool hasData = playerRecords.Count > 0 || objectRecords.Count > 0;
                UpdateEmptyDataGuide(hasData);
                summaryLabel.Text = "统计: " + targetServerUuid;
            }
            catch (Exception ex)
            {
                if (currentVersion != refreshVersion)
                {
                    return;
                }

                AntdUiHelper.ShowError(FindForm(), ex.Message, "刷新统计失败");
                if (boundConfig != null)
                {
                    summaryLabel.Text = "统计: " + boundConfig.ConfigName;
                }
            }
        }

        private StatisticsRefreshResult BuildRefreshResult(string serverUuid)
        {
            MonitoringQueryService query = appServices.MonitoringQueryService;
            var result = new StatisticsRefreshResult
            {
                PlayerRecords = query.GetPlayerStats(serverUuid, 500),
                ObjectRecords = query.GetRecentObjectStats(serverUuid, 200),
                TimelineRecords = query.GetObjectStatsTimeline(serverUuid, 500),
                DirectoryRecords = appServices.PlayerDirectoryService.LoadAll(),
            };
            return result;
        }

        private void OnInitOnline(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            try
            {
                int rowsAffected = appServices.MonitoringQueryService.InitPlayerOnlineInfo(boundConfig.ServerUUID);
                AntdUiHelper.ShowInfo(FindForm(), "已重置在线状态，影响行数: " + rowsAffected, "完成");
                RefreshAll();
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "失败");
            }
        }

        private void OnCleanupOldData(object sender, EventArgs e)
        {
            bool confirmed = AntdUiHelper.Confirm(FindForm(), "确认", "确定删除一个月前的服务器快照数据？");
            if (!confirmed)
            {
                return;
            }

            try
            {
                int rowsAffected = appServices.MonitoringQueryService.DeleteObjectStatsOlderThanOneMonth();
                AntdUiHelper.ShowInfo(FindForm(), "已清理 " + rowsAffected + " 条快照记录。", "完成");
                RefreshAll();
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "失败");
            }
        }

        private void OnExportCsv(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            using (var dialog = new SaveFileDialog())
            {
                dialog.Filter = "CSV 文件 (*.csv)|*.csv";
                dialog.FileName = boundConfig.ConfigName + "-stats.csv";
                if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
                {
                    return;
                }

                try
                {
                    MonitoringQueryService query = appServices.MonitoringQueryService;
                    List<MonitoringPlayerStatRecord> playerRecords =
                        query.GetPlayerStats(boundConfig.ServerUUID, 5000);
                    List<MonitoringObjectStatRecord> objectRecords =
                        query.GetRecentObjectStats(boundConfig.ServerUUID, 5000);
                    IReadOnlyList<PlayerDB> directoryRecords =
                        appServices.PlayerDirectoryService.LoadAll();

                    var builder = new System.Text.StringBuilder();
                    builder.AppendLine("# 战斗统计");
                    builder.Append(MonitoringCsvExporter.BuildPlayerStatsCsv(playerRecords));
                    builder.AppendLine();
                    builder.AppendLine("# 服务器快照");
                    builder.Append(MonitoringCsvExporter.BuildObjectStatsCsv(objectRecords));
                    builder.AppendLine();
                    builder.AppendLine("# 玩家库");
                    builder.Append(MonitoringCsvExporter.BuildPlayerDirectoryCsv(directoryRecords));

                    File.WriteAllBytes(
                        dialog.FileName,
                        MonitoringCsvExporter.ToUtf8BytesWithBom(builder.ToString()));
                    AntdUiHelper.ShowInfo(FindForm(), "CSV 已导出。", "完成");
                }
                catch (Exception ex)
                {
                    AntdUiHelper.ShowError(FindForm(), ex.Message, "导出失败");
                }
            }
        }

        private void OnExportHtmlReport(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            using (var dialog = new SaveFileDialog())
            {
                dialog.Filter = "HTML 文件 (*.html)|*.html";
                dialog.FileName = boundConfig.ConfigName + "-report-" + DateTime.Now.ToString("yyyy-MM-dd") + ".html";
                if (dialog.ShowDialog(FindForm()) != DialogResult.OK)
                {
                    return;
                }

                try
                {
                    MonitoringQueryService query = appServices.MonitoringQueryService;
                    List<MonitoringObjectStatRecord> snapshots =
                        query.GetObjectStatsTimeline(boundConfig.ServerUUID, 5000);
                    List<MonitoringPlayerStatRecord> playerRecords =
                        query.GetPlayerStats(boundConfig.ServerUUID, 500);
                    string html = MonitoringHtmlReportBuilder.BuildDailyReport(
                        boundConfig.ConfigName,
                        boundConfig.ServerUUID,
                        DateTime.Now,
                        snapshots,
                        playerRecords);
                    File.WriteAllText(dialog.FileName, html, System.Text.Encoding.UTF8);
                    AntdUiHelper.ShowInfo(FindForm(), "HTML 日报已导出。", "完成");
                }
                catch (Exception ex)
                {
                    AntdUiHelper.ShowError(FindForm(), ex.Message, "导出失败");
                }
            }
        }

        private static AntTable CreateStatsTable(params AntdTableHelper.ColumnSpec[] specs)
        {
            AntTable table = AntdTableHelper.CreateStandardTable();
            var columns = new AntdUI.ColumnCollection();
            foreach (AntdTableHelper.ColumnSpec spec in specs)
            {
                columns.Add(
                    new AntdUI.Column(spec.Key, spec.Title)
                    {
                        Width = spec.Width,
                        Align = spec.Align,
                        ReadOnly = true,
                    });
            }

            table.Columns = columns;
            return table;
        }

        private sealed class StatisticsRefreshResult
        {
            public List<MonitoringPlayerStatRecord> PlayerRecords { get; set; } = new List<MonitoringPlayerStatRecord>();

            public List<MonitoringObjectStatRecord> ObjectRecords { get; set; } = new List<MonitoringObjectStatRecord>();

            public List<MonitoringObjectStatRecord> TimelineRecords { get; set; } = new List<MonitoringObjectStatRecord>();

            public IReadOnlyList<PlayerDB> DirectoryRecords { get; set; } = new List<PlayerDB>();
        }
    }
}
