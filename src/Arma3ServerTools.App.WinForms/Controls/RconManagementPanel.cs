using System;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;
using BytexDigital.BattlEye.Rcon.Domain;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class RconManagementPanel : UserControl, IServerSettingsPanel
    {
        private readonly Button connectButton;
        private readonly Button refreshPlayersButton;
        private readonly Button kickButton;
        private Button refreshBansButton;
        private Button removeBanButton;
        private Button loadBansButton;
        private Button saveBansButton;
        private Button sendAllButton;
        private Button sendPlayerButton;
        private Button refreshMissionsButton;
        private Button restartMissionButton;
        private Button lockButton;
        private Button unlockButton;
        private readonly Button syncPlayersButton;

        private readonly DataGridView playersGrid;
        private readonly DataGridView bansGrid;
        private readonly DataGridView missionsGrid;
        private readonly TextBox kickReasonTextBox;
        private readonly TextBox broadcastTextBox;
        private readonly TextBox playerMessageTextBox;
        private readonly Label statusLabel;

        private ArmaServerConfig boundConfig;
        private bool connected;

        public RconManagementPanel()
        {
            Dock = DockStyle.Fill;
            Padding = new Padding(12);

            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            connectButton = new Button { Text = "连接 RCon", AutoSize = true };
            refreshPlayersButton = CreateActionButton("刷新玩家");
            kickButton = CreateActionButton("踢出选中");
            syncPlayersButton = CreateActionButton("同步到玩家库");
            connectButton.Click += OnConnect;
            refreshPlayersButton.Click += delegate { RunSafe(LoadPlayersAsync); };
            kickButton.Click += OnKickPlayer;
            syncPlayersButton.Click += delegate { RunSafe(SyncPlayersAsync); };
            toolbar.Controls.Add(connectButton);
            toolbar.Controls.Add(refreshPlayersButton);
            toolbar.Controls.Add(kickButton);
            toolbar.Controls.Add(syncPlayersButton);

            statusLabel = new Label
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Text = "未连接",
                Padding = new Padding(0, 8, 0, 8),
            };

            kickReasonTextBox = new TextBox { Dock = DockStyle.Top, Text = "管理员踢出" };
            broadcastTextBox = new TextBox { Dock = DockStyle.Top, Text = "服务器公告" };
            playerMessageTextBox = new TextBox { Dock = DockStyle.Top, Text = "私信内容" };

            playersGrid = CreateGrid(new[] { "Id", "Name", "Guid", "Ip" });
            bansGrid = CreateGrid(new[] { "Id", "Guid", "Ip", "Duration", "Reason" });
            missionsGrid = CreateGrid(new[] { "Map", "Mission" });

            var tabs = new TabControl { Dock = DockStyle.Fill };
            tabs.TabPages.Add(WrapPage("在线玩家", playersGrid));
            tabs.TabPages.Add(WrapPage("BattlEye 封禁", CreateBanPanel()));
            tabs.TabPages.Add(WrapPage("任务 / 控制", CreateMissionPanel()));

            Controls.Add(tabs);
            Controls.Add(kickReasonTextBox);
            Controls.Add(statusLabel);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            boundConfig = config;
            connected = false;
            ClearGrids();
            SetConnectedUi(false);
            if (config == null)
            {
                Enabled = false;
                statusLabel.Text = "未选择服务器";
                return;
            }

            Enabled = true;
            statusLabel.Text = "RCon 端口 " + config.BattlEyeConfig.RConPort + "，点击连接";
        }

        public void ApplyToModel()
        {
        }

        private Control CreateBanPanel()
        {
            var panel = new Panel { Dock = DockStyle.Fill };
            var banToolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            refreshBansButton = CreateActionButton("刷新封禁");
            removeBanButton = CreateActionButton("移除选中");
            loadBansButton = CreateActionButton("LoadBans");
            saveBansButton = CreateActionButton("SaveBans");
            refreshBansButton.Click += delegate { RunSafe(LoadBansAsync); };
            removeBanButton.Click += OnRemoveBan;
            loadBansButton.Click += delegate { RunSafe(LoadBansCommandAsync); };
            saveBansButton.Click += delegate { RunSafe(SaveBansCommandAsync); };
            banToolbar.Controls.Add(refreshBansButton);
            banToolbar.Controls.Add(removeBanButton);
            banToolbar.Controls.Add(loadBansButton);
            banToolbar.Controls.Add(saveBansButton);

            bansGrid.Dock = DockStyle.Fill;
            panel.Controls.Add(bansGrid);
            panel.Controls.Add(banToolbar);
            return panel;
        }

        private Control CreateMissionPanel()
        {
            var panel = new Panel { Dock = DockStyle.Fill };
            var missionToolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            refreshMissionsButton = CreateActionButton("刷新任务");
            restartMissionButton = CreateActionButton("重启任务");
            lockButton = CreateActionButton("锁定服务器");
            unlockButton = CreateActionButton("解锁服务器");
            sendAllButton = CreateActionButton("全服公告");
            sendPlayerButton = CreateActionButton("私信玩家");
            refreshMissionsButton.Click += delegate { RunSafe(LoadMissionsAsync); };
            restartMissionButton.Click += delegate { RunSafe(RestartMissionAsync); };
            lockButton.Click += delegate { RunSafe(LockServerAsync); };
            unlockButton.Click += delegate { RunSafe(UnlockServerAsync); };
            sendAllButton.Click += OnSendBroadcast;
            sendPlayerButton.Click += OnSendPlayerMessage;

            missionToolbar.Controls.Add(refreshMissionsButton);
            missionToolbar.Controls.Add(restartMissionButton);
            missionToolbar.Controls.Add(lockButton);
            missionToolbar.Controls.Add(unlockButton);
            missionToolbar.Controls.Add(sendAllButton);
            missionToolbar.Controls.Add(sendPlayerButton);

            broadcastTextBox.Dock = DockStyle.Top;
            playerMessageTextBox.Dock = DockStyle.Top;
            missionsGrid.Dock = DockStyle.Fill;
            panel.Controls.Add(missionsGrid);
            panel.Controls.Add(playerMessageTextBox);
            panel.Controls.Add(broadcastTextBox);
            panel.Controls.Add(missionToolbar);
            return panel;
        }

        private async void OnConnect(object sender, EventArgs e)
        {
            if (boundConfig == null)
            {
                return;
            }

            connectButton.Enabled = false;
            try
            {
                connected = false;
                SetConnectedUi(false);
                IRconService rcon = AppServices.Instance.RconService;
                await rcon.ConnectAsync(
                    "127.0.0.1",
                    boundConfig.BattlEyeConfig.RConPort,
                    boundConfig.BattlEyeConfig.RConPassword,
                    CancellationToken.None).ConfigureAwait(true);
                connected = true;
                statusLabel.Text = "已连接到 127.0.0.1:" + boundConfig.BattlEyeConfig.RConPort;
                SetConnectedUi(true);
                await LoadPlayersAsync().ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                statusLabel.Text = "连接失败: " + ex.Message;
                MessageBox.Show(ex.Message, "RCon 连接失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
                connected = false;
                SetConnectedUi(false);
            }
            finally
            {
                connectButton.Enabled = true;
            }
        }

        private async void OnKickPlayer(object sender, EventArgs e)
        {
            if (!connected || playersGrid.SelectedRows.Count == 0)
            {
                return;
            }

            try
            {
                int playerId = Convert.ToInt32(playersGrid.SelectedRows[0].Cells["Id"].Value);
                await AppServices.Instance.RconService.KickAsync(playerId, kickReasonTextBox.Text.Trim()).ConfigureAwait(true);
                await LoadPlayersAsync().ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "踢出失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async void OnRemoveBan(object sender, EventArgs e)
        {
            if (!connected || bansGrid.SelectedRows.Count == 0)
            {
                return;
            }

            try
            {
                int banId = Convert.ToInt32(bansGrid.SelectedRows[0].Cells["Id"].Value);
                await AppServices.Instance.RconService.RemoveBanAsync(banId).ConfigureAwait(true);
                await LoadBansAsync().ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "移除封禁失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async void OnSendBroadcast(object sender, EventArgs e)
        {
            if (!connected)
            {
                return;
            }

            try
            {
                await AppServices.Instance.RconService.SendMessageAsync(broadcastTextBox.Text.Trim()).ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "发送失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async void OnSendPlayerMessage(object sender, EventArgs e)
        {
            if (!connected || playersGrid.SelectedRows.Count == 0)
            {
                return;
            }

            try
            {
                int playerId = Convert.ToInt32(playersGrid.SelectedRows[0].Cells["Id"].Value);
                await AppServices.Instance.RconService.SendMessageToPlayerAsync(playerId, playerMessageTextBox.Text.Trim()).ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "发送失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private async Task LoadPlayersAsync()
        {
            playersGrid.Rows.Clear();
            if (!connected)
            {
                return;
            }

            System.Collections.Generic.IReadOnlyList<Player> players = await AppServices.Instance.RconService.GetPlayersAsync().ConfigureAwait(true);
            foreach (Player player in players)
            {
                string ip = string.Empty;
                if (player.RemoteEndpoint != null && player.RemoteEndpoint.Address != null)
                {
                    ip = player.RemoteEndpoint.Address.ToString();
                }

                playersGrid.Rows.Add(player.Id, player.Name, player.Guid, ip);
            }
        }

        private async Task SyncPlayersAsync()
        {
            if (!connected)
            {
                return;
            }

            System.Collections.Generic.IReadOnlyList<Player> players = await AppServices.Instance.RconService.GetPlayersAsync().ConfigureAwait(true);
            AppServices.Instance.PlayerDirectoryService.SyncPlayers(players);
            MessageBox.Show("已将在线玩家同步到 destiny_players.db。", "完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private async Task LoadBansAsync()
        {
            bansGrid.Rows.Clear();
            if (!connected)
            {
                return;
            }

            System.Collections.Generic.IReadOnlyList<PlayerBan> bans = await AppServices.Instance.RconService.GetBansAsync().ConfigureAwait(true);
            foreach (PlayerBan ban in bans)
            {
                string guid = ban.Guid ?? string.Empty;
                string ip = ban.Ip != null ? ban.Ip.ToString() : string.Empty;
                string duration;
                if (ban.IsPermanent)
                {
                    duration = "永久";
                }
                else
                {
                    duration = ban.DurationLeft.ToString();
                }

                bansGrid.Rows.Add(ban.Id, guid, ip, duration, ban.Reason);
            }
        }

        private async Task LoadBansCommandAsync()
        {
            await AppServices.Instance.RconService.LoadBansAsync().ConfigureAwait(true);
            await LoadBansAsync().ConfigureAwait(true);
        }

        private async Task SaveBansCommandAsync()
        {
            await AppServices.Instance.RconService.SaveBansAsync().ConfigureAwait(true);
            MessageBox.Show("已执行 SaveBans。", "完成", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private async Task LoadMissionsAsync()
        {
            missionsGrid.Rows.Clear();
            if (!connected)
            {
                return;
            }

            System.Collections.Generic.IReadOnlyList<Mission> missions = await AppServices.Instance.RconService.GetMissionsAsync().ConfigureAwait(true);
            foreach (Mission mission in missions)
            {
                missionsGrid.Rows.Add(mission.Map, mission.Name);
            }
        }

        private async Task RestartMissionAsync()
        {
            await AppServices.Instance.RconService.RestartMissionAsync().ConfigureAwait(true);
        }

        private async Task LockServerAsync()
        {
            await AppServices.Instance.RconService.LockServerAsync().ConfigureAwait(true);
        }

        private async Task UnlockServerAsync()
        {
            await AppServices.Instance.RconService.UnlockServerAsync().ConfigureAwait(true);
        }

        private void RunSafe(Func<Task> action)
        {
            if (!connected)
            {
                MessageBox.Show("请先连接 RCon。", "提示", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            try
            {
                action().GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                MessageBox.Show(ex.Message, "操作失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void SetConnectedUi(bool isConnected)
        {
            refreshPlayersButton.Enabled = isConnected;
            kickButton.Enabled = isConnected;
            syncPlayersButton.Enabled = isConnected;
            refreshBansButton.Enabled = isConnected;
            removeBanButton.Enabled = isConnected;
            loadBansButton.Enabled = isConnected;
            saveBansButton.Enabled = isConnected;
            refreshMissionsButton.Enabled = isConnected;
            restartMissionButton.Enabled = isConnected;
            lockButton.Enabled = isConnected;
            unlockButton.Enabled = isConnected;
            sendAllButton.Enabled = isConnected;
            sendPlayerButton.Enabled = isConnected;
        }

        private void ClearGrids()
        {
            playersGrid.Rows.Clear();
            bansGrid.Rows.Clear();
            missionsGrid.Rows.Clear();
        }

        private static Button CreateActionButton(string text)
        {
            return new Button { Text = text, AutoSize = true, Enabled = false };
        }

        private static DataGridView CreateGrid(string[] columns)
        {
            var grid = new DataGridView
            {
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
