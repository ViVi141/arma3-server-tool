using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;
using BytexDigital.BattlEye.Rcon.Domain;
using AntLabel = AntdUI.Label;
using AntTable = AntdUI.Table;

namespace Arma3ServerTools.App.WinForms.Controls
{
    internal sealed class RconPlayerRow
    {
        public int Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public string Guid { get; set; } = string.Empty;

        public string Ip { get; set; } = string.Empty;
    }

    internal sealed class RconBanRow
    {
        public int Id { get; set; }

        public string Guid { get; set; } = string.Empty;

        public string Ip { get; set; } = string.Empty;

        public string Duration { get; set; } = string.Empty;

        public string Reason { get; set; } = string.Empty;
    }

    internal sealed class RconMissionRow
    {
        public string Map { get; set; } = string.Empty;

        public string Mission { get; set; } = string.Empty;
    }

    internal sealed class RconManagementPanel : UserControl, IServerSettingsPanel
    {
        private readonly AntdUI.Button connectButton;
        private readonly AntdUI.Button refreshPlayersButton;
        private readonly AntdUI.Button kickButton;
        private AntdUI.Button refreshBansButton;
        private AntdUI.Button removeBanButton;
        private AntdUI.Button loadBansButton;
        private AntdUI.Button saveBansButton;
        private AntdUI.Button sendAllButton;
        private AntdUI.Button sendPlayerButton;
        private AntdUI.Button refreshMissionsButton;
        private AntdUI.Button restartMissionButton;
        private AntdUI.Button lockButton;
        private AntdUI.Button unlockButton;
        private readonly AntdUI.Button syncPlayersButton;

        private readonly AntTable playersTable;
        private readonly AntTable bansTable;
        private readonly AntTable missionsTable;
        private readonly AntdUI.Input kickReasonInput;
        private readonly AntdUI.Input broadcastInput;
        private readonly AntdUI.Input playerMessageInput;
        private readonly AntLabel statusLabel;

        private readonly List<RconPlayerRow> playerRows = new List<RconPlayerRow>();
        private readonly List<RconBanRow> banRows = new List<RconBanRow>();
        private readonly List<RconMissionRow> missionRows = new List<RconMissionRow>();

        private ArmaServerConfig boundConfig;
        private bool connected;

        public RconManagementPanel()
        {
            AppTheme.ApplyTo(this);

            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            connectButton = SettingsLayoutHelper.CreateButton("连接 RCon");
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

            statusLabel = new AntLabel
            {
                Dock = DockStyle.Top,
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Text = "未连接",
                Padding = new Padding(0, UiScaleHelper.Scale(8), 0, UiScaleHelper.Scale(8)),
            };

            kickReasonInput = SettingsLayoutHelper.CreateInput(true);
            kickReasonInput.Dock = DockStyle.Top;
            kickReasonInput.Text = "管理员踢出";

            broadcastInput = SettingsLayoutHelper.CreateInput(true);
            broadcastInput.Dock = DockStyle.Top;
            broadcastInput.Text = "服务器公告";

            playerMessageInput = SettingsLayoutHelper.CreateInput(true);
            playerMessageInput.Dock = DockStyle.Top;
            playerMessageInput.Text = "私信内容";

            playersTable = CreateRconTable(
                new AntdTableHelper.ColumnSpec("Id", "Id", "10%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Name", "Name", "28%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Guid", "Guid", "34%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Ip", "Ip", "28%", AntdUI.ColumnAlign.Left));
            bansTable = CreateRconTable(
                new AntdTableHelper.ColumnSpec("Id", "Id", "10%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Guid", "Guid", "28%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Ip", "Ip", "18%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Duration", "Duration", "14%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Reason", "Reason", "30%", AntdUI.ColumnAlign.Left));
            missionsTable = CreateRconTable(
                new AntdTableHelper.ColumnSpec("Map", "Map", "42%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Mission", "Mission", "58%", AntdUI.ColumnAlign.Left));

            var tabs = AntdUiHelper.CreateTabsPanel();
            AntdUiHelper.AddTabPage(tabs, "在线玩家", playersTable);
            AntdUiHelper.AddTabPage(tabs, "BattlEye 封禁", CreateBanPanel());
            AntdUiHelper.AddTabPage(tabs, "任务 / 控制", CreateMissionPanel());

            Controls.Add(tabs);
            Controls.Add(kickReasonInput);
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

            bansTable.Dock = DockStyle.Fill;
            panel.Controls.Add(bansTable);
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

            broadcastInput.Dock = DockStyle.Top;
            playerMessageInput.Dock = DockStyle.Top;
            missionsTable.Dock = DockStyle.Fill;
            panel.Controls.Add(missionsTable);
            panel.Controls.Add(playerMessageInput);
            panel.Controls.Add(broadcastInput);
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
                AntdUiHelper.ShowError(FindForm(), ex.Message, "RCon 连接失败");
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
            if (!connected)
            {
                return;
            }

            int idx = AntdTableHelper.GetSelectedRowIndex(playersTable);
            if (idx < 0 || idx >= playerRows.Count)
            {
                return;
            }

            try
            {
                int playerId = playerRows[idx].Id;
                await AppServices.Instance.RconService.KickAsync(playerId, kickReasonInput.Text.Trim()).ConfigureAwait(true);
                await LoadPlayersAsync().ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "踢出失败");
            }
        }

        private async void OnRemoveBan(object sender, EventArgs e)
        {
            if (!connected)
            {
                return;
            }

            int idx = AntdTableHelper.GetSelectedRowIndex(bansTable);
            if (idx < 0 || idx >= banRows.Count)
            {
                return;
            }

            try
            {
                int banId = banRows[idx].Id;
                await AppServices.Instance.RconService.RemoveBanAsync(banId).ConfigureAwait(true);
                await LoadBansAsync().ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "移除封禁失败");
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
                await AppServices.Instance.RconService.SendMessageAsync(broadcastInput.Text.Trim()).ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "发送失败");
            }
        }

        private async void OnSendPlayerMessage(object sender, EventArgs e)
        {
            if (!connected)
            {
                return;
            }

            int idx = AntdTableHelper.GetSelectedRowIndex(playersTable);
            if (idx < 0 || idx >= playerRows.Count)
            {
                return;
            }

            try
            {
                int playerId = playerRows[idx].Id;
                await AppServices.Instance.RconService.SendMessageToPlayerAsync(playerId, playerMessageInput.Text.Trim()).ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "发送失败");
            }
        }

        private async Task LoadPlayersAsync()
        {
            if (!connected)
            {
                playerRows.Clear();
                AntdTableHelper.BindList(playersTable, playerRows);
                return;
            }

            IReadOnlyList<Player> players = await AppServices.Instance.RconService.GetPlayersAsync().ConfigureAwait(true);
            playerRows.Clear();
            foreach (Player player in players)
            {
                string ip = string.Empty;
                if (player.RemoteEndpoint != null && player.RemoteEndpoint.Address != null)
                {
                    ip = player.RemoteEndpoint.Address.ToString();
                }

                playerRows.Add(
                    new RconPlayerRow
                    {
                        Id = player.Id,
                        Name = player.Name,
                        Guid = player.Guid,
                        Ip = ip,
                    });
            }

            AntdTableHelper.BindList(playersTable, playerRows);
        }

        private async Task SyncPlayersAsync()
        {
            if (!connected)
            {
                return;
            }

            IReadOnlyList<Player> players = await AppServices.Instance.RconService.GetPlayersAsync().ConfigureAwait(true);
            AppServices.Instance.PlayerDirectoryService.SyncPlayers(players);
            AntdUiHelper.ShowInfo(FindForm(), "已将在线玩家同步到 destiny_players.db。", "完成");
        }

        private async Task LoadBansAsync()
        {
            if (!connected)
            {
                banRows.Clear();
                AntdTableHelper.BindList(bansTable, banRows);
                return;
            }

            IReadOnlyList<PlayerBan> bans = await AppServices.Instance.RconService.GetBansAsync().ConfigureAwait(true);
            banRows.Clear();
            foreach (PlayerBan ban in bans)
            {
                string guid = ban.Guid ?? string.Empty;
                string ip = string.Empty;
                if (ban.Ip != null)
                {
                    ip = ban.Ip.ToString();
                }

                string duration;
                if (ban.IsPermanent)
                {
                    duration = "永久";
                }
                else
                {
                    duration = ban.DurationLeft.ToString();
                }

                banRows.Add(
                    new RconBanRow
                    {
                        Id = ban.Id,
                        Guid = guid,
                        Ip = ip,
                        Duration = duration,
                        Reason = ban.Reason,
                    });
            }

            AntdTableHelper.BindList(bansTable, banRows);
        }

        private async Task LoadBansCommandAsync()
        {
            await AppServices.Instance.RconService.LoadBansAsync().ConfigureAwait(true);
            await LoadBansAsync().ConfigureAwait(true);
        }

        private async Task SaveBansCommandAsync()
        {
            await AppServices.Instance.RconService.SaveBansAsync().ConfigureAwait(true);
            AntdUiHelper.ShowInfo(FindForm(), "已执行 SaveBans。", "完成");
        }

        private async Task LoadMissionsAsync()
        {
            if (!connected)
            {
                missionRows.Clear();
                AntdTableHelper.BindList(missionsTable, missionRows);
                return;
            }

            IReadOnlyList<Mission> missions = await AppServices.Instance.RconService.GetMissionsAsync().ConfigureAwait(true);
            missionRows.Clear();
            foreach (Mission mission in missions)
            {
                missionRows.Add(
                    new RconMissionRow
                    {
                        Map = mission.Map,
                        Mission = mission.Name,
                    });
            }

            AntdTableHelper.BindList(missionsTable, missionRows);
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
                AntdUiHelper.ShowInfo(FindForm(), "请先连接 RCon。", "提示");
                return;
            }

            try
            {
                action().GetAwaiter().GetResult();
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "操作失败");
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
            playerRows.Clear();
            banRows.Clear();
            missionRows.Clear();
            AntdTableHelper.BindList(playersTable, playerRows);
            AntdTableHelper.BindList(bansTable, banRows);
            AntdTableHelper.BindList(missionsTable, missionRows);
        }

        private static AntdUI.Button CreateActionButton(string text)
        {
            AntdUI.Button button = SettingsLayoutHelper.CreateButton(text);
            button.Enabled = false;
            return button;
        }

        private static AntTable CreateRconTable(params AntdTableHelper.ColumnSpec[] specs)
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
