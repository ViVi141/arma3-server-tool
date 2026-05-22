using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Services;
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

    internal sealed class StatisticsManagementPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntTable playerStatsTable;
        private readonly AntTable objectStatsTable;
        private readonly AntTable playerDirectoryTable;
        private readonly AntLabel summaryLabel;
        private readonly StatisticsChartsPanel chartsPanel;

        private ArmaServerConfig boundConfig;
        private readonly System.Collections.Generic.List<StatisticsPlayerStatRow> playerStatRows = new System.Collections.Generic.List<StatisticsPlayerStatRow>();
        private readonly System.Collections.Generic.List<StatisticsObjectStatRow> objectStatRows = new System.Collections.Generic.List<StatisticsObjectStatRow>();
        private readonly System.Collections.Generic.List<StatisticsPlayerDirectoryRow> directoryRows = new System.Collections.Generic.List<StatisticsPlayerDirectoryRow>();

        public StatisticsManagementPanel()
        {
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
            toolbar.Controls.Add(refreshButton);
            toolbar.Controls.Add(initOnlineButton);
            toolbar.Controls.Add(cleanupButton);
            toolbar.Controls.Add(exportCsvButton);
            toolbar.Controls.Add(exportHtmlButton);

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
                return;
            }

            Enabled = true;
            summaryLabel.Text = "统计服务器: " + config.ConfigName + " (" + config.ServerUUID + ")";
            RefreshAll();
        }

        public void ApplyToModel()
        {
        }

        private void RefreshAll()
        {
            if (boundConfig == null)
            {
                return;
            }

            try
            {
                MonitoringQueryService query = AppServices.Instance.MonitoringQueryService;
                List<MonitoringPlayerStatRecord> playerRecords =
                    query.GetPlayerStats(boundConfig.ServerUUID, 500);
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

                List<MonitoringObjectStatRecord> objectRecords =
                    query.GetRecentObjectStats(boundConfig.ServerUUID, 200);
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

                List<MonitoringObjectStatRecord> timelineRecords =
                    query.GetObjectStatsTimeline(boundConfig.ServerUUID, 500);
                chartsPanel.RenderCharts(timelineRecords, playerRecords);

                directoryRows.Clear();
                foreach (PlayerDB player in AppServices.Instance.PlayerDirectoryService.LoadAll())
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
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "刷新统计失败");
            }
        }

        private void OnInitOnline(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            try
            {
                int rowsAffected = AppServices.Instance.MonitoringQueryService.InitPlayerOnlineInfo(boundConfig.ServerUUID);
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
                int rowsAffected = AppServices.Instance.MonitoringQueryService.DeleteObjectStatsOlderThanOneMonth();
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
                    MonitoringQueryService query = AppServices.Instance.MonitoringQueryService;
                    List<MonitoringPlayerStatRecord> playerRecords =
                        query.GetPlayerStats(boundConfig.ServerUUID, 5000);
                    List<MonitoringObjectStatRecord> objectRecords =
                        query.GetRecentObjectStats(boundConfig.ServerUUID, 5000);
                    IReadOnlyList<PlayerDB> directoryRecords =
                        AppServices.Instance.PlayerDirectoryService.LoadAll();

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
                    MonitoringQueryService query = AppServices.Instance.MonitoringQueryService;
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
    }
}
