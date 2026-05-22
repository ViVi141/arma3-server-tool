using System;
using System.Windows.Forms;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class StatisticsManagementPanel : UserControl, IServerSettingsPanel
    {
        private readonly DataGridView playerStatsGrid;
        private readonly DataGridView objectStatsGrid;
        private readonly DataGridView playerDirectoryGrid;
        private readonly Label summaryLabel;

        private ArmaServerConfig boundConfig;

        public StatisticsManagementPanel()
        {
            Dock = DockStyle.Fill;
            Padding = new Padding(12);

            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            var refreshButton = new Button { Text = "刷新统计", AutoSize = true };
            var initOnlineButton = new Button { Text = "重置在线状态", AutoSize = true };
            var cleanupButton = new Button { Text = "清理一月前快照", AutoSize = true };
            refreshButton.Click += delegate { RefreshAll(); };
            initOnlineButton.Click += OnInitOnline;
            cleanupButton.Click += OnCleanupOldData;
            toolbar.Controls.Add(refreshButton);
            toolbar.Controls.Add(initOnlineButton);
            toolbar.Controls.Add(cleanupButton);

            summaryLabel = new Label
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(0, 8, 0, 8),
                Text = "选择服务器后点击刷新统计",
            };

            var tabs = new TabControl { Dock = DockStyle.Fill };
            playerStatsGrid = CreateGrid(new[] { "PlayerId", "Name", "Infantry", "Soft", "Armor", "Air", "Deaths", "Score", "Online", "Time" });
            objectStatsGrid = CreateGrid(new[] { "Id", "Players", "Units", "FPS", "FPS Min", "Time" });
            playerDirectoryGrid = CreateGrid(new[] { "Guid", "Name", "IP", "LastSeen" });

            tabs.TabPages.Add(WrapPage("战斗统计", playerStatsGrid));
            tabs.TabPages.Add(WrapPage("服务器快照", objectStatsGrid));
            tabs.TabPages.Add(WrapPage("玩家库", playerDirectoryGrid));

            Controls.Add(tabs);
            Controls.Add(summaryLabel);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            playerStatsGrid.Rows.Clear();
            objectStatsGrid.Rows.Clear();
            playerDirectoryGrid.Rows.Clear();
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
                playerStatsGrid.Rows.Clear();
                foreach (MonitoringPlayerStatRecord row in query.GetPlayerStats(boundConfig.ServerUUID, 500))
                {
                    playerStatsGrid.Rows.Add(
                        row.PlayerId,
                        row.PlayerName,
                        row.InfantryKills,
                        row.SoftVehicleKills,
                        row.ArmorKills,
                        row.AirKills,
                        row.Deaths,
                        row.TotalScore,
                        row.Online,
                        row.CreateTime);
                }

                objectStatsGrid.Rows.Clear();
                foreach (MonitoringObjectStatRecord row in query.GetRecentObjectStats(boundConfig.ServerUUID, 200))
                {
                    objectStatsGrid.Rows.Add(
                        row.Id,
                        row.AllPlayers,
                        row.AllUnits,
                        row.Fps,
                        row.FpsMin,
                        row.CreateTime);
                }

                playerDirectoryGrid.Rows.Clear();
                foreach (PlayerDB player in AppServices.Instance.PlayerDirectoryService.LoadAll())
                {
                    playerDirectoryGrid.Rows.Add(player.Guid, player.Name, player.Ip, player.Time);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "刷新统计失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
                int rows = AppServices.Instance.MonitoringQueryService.InitPlayerOnlineInfo(boundConfig.ServerUUID);
                MessageBox.Show("已重置在线状态，影响行数: " + rows, "完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
                RefreshAll();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OnCleanupOldData(object sender, EventArgs e)
        {
            DialogResult confirm = MessageBox.Show(
                "确定删除一个月前的服务器快照数据？",
                "确认",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);
            if (confirm != DialogResult.Yes)
            {
                return;
            }

            try
            {
                int rows = AppServices.Instance.MonitoringQueryService.DeleteObjectStatsOlderThanOneMonth();
                MessageBox.Show("已清理 " + rows + " 条快照记录。", "完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
                RefreshAll();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static DataGridView CreateGrid(string[] columns)
        {
            var grid = new DataGridView
            {
                Dock = DockStyle.Fill,
                ReadOnly = true,
                AllowUserToAddRows = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
            };

            foreach (string column in columns)
            {
                grid.Columns.Add(column, column);
            }

            return grid;
        }

        private static TabPage WrapPage(string title, Control content)
        {
            var page = new TabPage(title);
            content.Dock = DockStyle.Fill;
            page.Controls.Add(content);
            return page;
        }
    }
}
