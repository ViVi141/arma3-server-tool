using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using BytexDigital.BattlEye.Rcon.Domain;
using AntInput = AntdUI.Input;
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

    internal sealed class RconManagementPanel : UserControl, IApplyOnlySettingsPanel
    {
        public event EventHandler ConfigSaved;

        private readonly IAppServices appServices;
        private readonly AntdUI.Button connectButton;
        private readonly AntdUI.Button refreshPlayersButton;
        private readonly AntdUI.Button kickButton;
        private AntdUI.Button banTempButton;
        private AntdUI.Button banPermButton;
        private AntdUI.Button refreshBansButton;
        private AntdUI.Button removeBanButton;
        private AntdUI.Button loadBansButton;
        private AntdUI.Button saveBansButton;
        private AntdUI.Button sendAllButton;
        private AntdUI.Button sendPlayerButton;
        private AntdUI.Button refreshMissionsButton;
        private AntdUI.Button loadMissionButton;
        private AntdUI.Button restartMissionButton;
        private AntdUI.Button lockButton;
        private AntdUI.Button unlockButton;
        private AntdUI.Button changePasswordButton;
        private readonly AntdUI.Button syncPlayersButton;
        private readonly AntdUI.Input newRconPasswordInput;

        private readonly AntTable playersTable;
        private readonly AntTable bansTable;
        private readonly AntTable missionsTable;
        private readonly AntdUI.Input kickReasonInput;
        private readonly AntdUI.InputNumber banDurationNumeric;
        private readonly AntdUI.Input broadcastInput;
        private readonly AntdUI.Input playerMessageInput;
        private readonly AntLabel statusLabel;

        private readonly List<RconPlayerRow> playerRows = new List<RconPlayerRow>();
        private readonly List<RconBanRow> banRows = new List<RconBanRow>();
        private readonly List<RconMissionRow> missionRows = new List<RconMissionRow>();

        private ArmaServerConfig boundConfig;
        private bool connected;

        public RconManagementPanel(IAppServices appServices)
        {
            this.appServices = appServices;
            AppTheme.ApplyTo(this);

            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true };
            connectButton = SettingsLayoutHelper.CreateButton("连接远程控制");
            refreshPlayersButton = CreateActionButton("刷新玩家");
            kickButton = CreateActionButton("踢出选中");
            banTempButton = CreateActionButton("封禁(分钟)");
            banPermButton = CreateActionButton("永久封禁");
            syncPlayersButton = CreateActionButton("同步到玩家库");
            connectButton.Click += OnConnect;
            refreshPlayersButton.Click += delegate { RunSafeAsync(LoadPlayersAsync); };
            kickButton.Click += OnKickPlayer;
            banTempButton.Click += OnBanTemporary;
            banPermButton.Click += OnBanPermanent;
            syncPlayersButton.Click += delegate { RunSafeAsync(SyncPlayersAsync); };
            changePasswordButton = CreateActionButton("修改 RCon 密码");
            changePasswordButton.Click += OnChangeRconPassword;
            toolbar.Controls.Add(connectButton);
            toolbar.Controls.Add(refreshPlayersButton);
            toolbar.Controls.Add(kickButton);
            toolbar.Controls.Add(banTempButton);
            toolbar.Controls.Add(banPermButton);
            toolbar.Controls.Add(syncPlayersButton);
            toolbar.Controls.Add(changePasswordButton);

            Control rconPwdContainer = SettingsLayoutHelper.CreatePasswordInputWithToggle(out AntInput rconPwdInput);
            newRconPasswordInput = rconPwdInput;
            rconPwdContainer.Dock = DockStyle.Top;
            newRconPasswordInput.PlaceholderText = "新 RCon 密码（连接后可用，会同步写入工具配置）";
            Controls.Add(rconPwdContainer);

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

            banDurationNumeric = SettingsLayoutHelper.CreateNumeric(1, 10080, 60, 120);
            var banDurationBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                Padding = new Padding(0, 0, 0, UiScaleHelper.Scale(4)),
            };
            banDurationBar.Controls.Add(new AntLabel
            {
                Text = "封禁时长(分钟)",
                AutoSizeMode = AntdUI.TAutoSize.Auto,
                Padding = new Padding(0, UiScaleHelper.Scale(8), UiScaleHelper.Scale(8), 0),
            });
            banDurationBar.Controls.Add(banDurationNumeric);

            broadcastInput = SettingsLayoutHelper.CreateInput(true);
            broadcastInput.Dock = DockStyle.Top;
            broadcastInput.Text = "服务器公告";

            playerMessageInput = SettingsLayoutHelper.CreateInput(true);
            playerMessageInput.Dock = DockStyle.Top;
            playerMessageInput.Text = "私信内容";

            playersTable = CreateRconTable(
                new AntdTableHelper.ColumnSpec("Id", "序号", "10%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Name", "昵称", "28%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Guid", "Steam GUID", "34%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Ip", "IP 地址", "28%", AntdUI.ColumnAlign.Left));
            bansTable = CreateRconTable(
                new AntdTableHelper.ColumnSpec("Id", "序号", "10%", AntdUI.ColumnAlign.Center),
                new AntdTableHelper.ColumnSpec("Guid", "Steam GUID", "28%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Ip", "IP 地址", "18%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Duration", "封禁时长", "14%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Reason", "原因", "30%", AntdUI.ColumnAlign.Left));
            missionsTable = CreateRconTable(
                new AntdTableHelper.ColumnSpec("Map", "地图", "42%", AntdUI.ColumnAlign.Left),
                new AntdTableHelper.ColumnSpec("Mission", "任务", "58%", AntdUI.ColumnAlign.Left));

            var tabs = AntdUiHelper.CreateTabsPanel();
            AntdUiHelper.AddTabPage(tabs, "在线玩家", playersTable);
            AntdUiHelper.AddTabPage(tabs, "任务 / 控制", CreateMissionPanel());
            AntdUiHelper.AddTabPage(tabs, "BattlEye 封禁", CreateBanPanel());

            Controls.Add(tabs);
            Controls.Add(kickReasonInput);
            Controls.Add(banDurationBar);
            Controls.Add(statusLabel);
            Controls.Add(toolbar);
        }

        public void Bind(ArmaServerConfig config)
        {
            DisconnectRcon();
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
            string host = ResolveRconHost();
            statusLabel.Text = "远程控制 " + host + ":" + config.BattlEyeConfig.RConPort + "，点击连接";
        }

        private void DisconnectRcon()
        {
            appServices.RconService.Dispose();
        }

        public void BindForApply(ArmaServerConfig config)
        {
            boundConfig = config;
            connected = false;
            if (config == null)
            {
                Enabled = false;
                statusLabel.Text = "未选择服务器";
                return;
            }

            Enabled = true;
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
            loadBansButton = CreateActionButton("加载封禁");
            saveBansButton = CreateActionButton("保存封禁");
            refreshBansButton.Click += delegate { RunSafeAsync(LoadBansAsync); };
            removeBanButton.Click += OnRemoveBan;
            loadBansButton.Click += delegate { RunSafeAsync(LoadBansCommandAsync); };
            saveBansButton.Click += delegate { RunSafeAsync(SaveBansCommandAsync); };
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
            loadMissionButton = CreateActionButton("加载选中");
            restartMissionButton = CreateActionButton("重启任务");
            lockButton = CreateActionButton("锁定服务器");
            unlockButton = CreateActionButton("解锁服务器");
            sendAllButton = CreateActionButton("全服公告");
            sendPlayerButton = CreateActionButton("私信玩家");
            refreshMissionsButton.Click += delegate { RunSafeAsync(LoadMissionsAsync); };
            loadMissionButton.Click += OnLoadMission;
            restartMissionButton.Click += delegate { RunSafeAsync(RestartMissionAsync); };
            lockButton.Click += delegate { RunSafeAsync(LockServerAsync); };
            unlockButton.Click += delegate { RunSafeAsync(UnlockServerAsync); };
            sendAllButton.Click += OnSendBroadcast;
            sendPlayerButton.Click += OnSendPlayerMessage;

            missionToolbar.Controls.Add(refreshMissionsButton);
            missionToolbar.Controls.Add(loadMissionButton);
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
                IRconService rcon = appServices.RconService;
                string host = ResolveRconHost();
                await rcon.ConnectAsync(
                    host,
                    boundConfig.BattlEyeConfig.RConPort,
                    boundConfig.BattlEyeConfig.RConPassword,
                    CancellationToken.None).ConfigureAwait(true);
                connected = true;
                statusLabel.Text = "已连接到 " + host + ":" + boundConfig.BattlEyeConfig.RConPort;
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

        private async void OnChangeRconPassword(object sender, EventArgs e)
        {
            if (!connected || boundConfig == null)
            {
                AntdUiHelper.ShowInfo(FindForm(), "请先连接 RCon。", "提示");
                return;
            }

            string newPassword = newRconPasswordInput.Text.Trim();
            if (string.IsNullOrEmpty(newPassword))
            {
                AntdUiHelper.ShowWarning(FindForm(), "请输入新 RCon 密码。", "提示");
                return;
            }

            if (!AntdUiHelper.Confirm(FindForm(), "确认", "确定通过 RCon 修改服务器密码吗？当前连接将保持有效。"))
            {
                return;
            }

            SetRconBusy(true);
            try
            {
                await appServices.RconService.ChangeRconPasswordAsync(newPassword).ConfigureAwait(true);
                boundConfig.BattlEyeConfig.RConPassword = newPassword;
                await Task.Run(() => appServices.ConfigService.Save(boundConfig)).ConfigureAwait(true);
                newRconPasswordInput.Text = string.Empty;
                AntdUiHelper.ShowInfo(
                    FindForm(),
                    "RCon 密码已修改并已保存到工具配置；请记得「应用到服务器目录」以更新 BattlEye 配置文件。",
                    "完成");
                if (ConfigSaved != null)
                {
                    ConfigSaved(this, EventArgs.Empty);
                }
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "修改失败");
            }
            finally
            {
                SetRconBusy(false);
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
                await appServices.RconService.KickAsync(playerId, kickReasonInput.Text.Trim()).ConfigureAwait(true);
                await LoadPlayersAsync().ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "踢出失败");
            }
        }

        private async void OnBanTemporary(object sender, EventArgs e)
        {
            if (!connected)
            {
                return;
            }

            RconPlayerRow player = GetSelectedPlayerRow();
            if (player == null)
            {
                return;
            }

            if (string.IsNullOrWhiteSpace(player.Guid))
            {
                AntdUiHelper.ShowWarning(FindForm(), "选中玩家没有有效的 Steam GUID。", "提示");
                return;
            }

            try
            {
                int minutes = (int)banDurationNumeric.Value;
                if (minutes < 1)
                {
                    minutes = 1;
                }

                string reason = kickReasonInput.Text.Trim();
                if (string.IsNullOrEmpty(reason))
                {
                    reason = "管理员封禁";
                }

                await appServices.RconService
                    .BanOnlinePlayerAsync(player.Guid, reason, TimeSpan.FromMinutes(minutes))
                    .ConfigureAwait(true);
                await LoadPlayersAsync().ConfigureAwait(true);
                AntdUiHelper.ShowInfo(FindForm(), "已封禁玩家 " + minutes + " 分钟。", "完成");
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "封禁失败");
            }
        }

        private async void OnBanPermanent(object sender, EventArgs e)
        {
            if (!connected)
            {
                return;
            }

            RconPlayerRow player = GetSelectedPlayerRow();
            if (player == null)
            {
                return;
            }

            if (string.IsNullOrWhiteSpace(player.Guid))
            {
                AntdUiHelper.ShowWarning(FindForm(), "选中玩家没有有效的 Steam GUID。", "提示");
                return;
            }

            if (!AntdUiHelper.Confirm(FindForm(), "确认", "确定永久封禁玩家 \"" + player.Name + "\" 吗？"))
            {
                return;
            }

            try
            {
                string reason = kickReasonInput.Text.Trim();
                if (string.IsNullOrEmpty(reason))
                {
                    reason = "管理员封禁";
                }

                await appServices.RconService
                    .BanOnlinePlayerPermanentAsync(player.Guid, reason)
                    .ConfigureAwait(true);
                await LoadPlayersAsync().ConfigureAwait(true);
                AntdUiHelper.ShowInfo(FindForm(), "已永久封禁玩家。", "完成");
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "封禁失败");
            }
        }

        private async void OnLoadMission(object sender, EventArgs e)
        {
            if (!connected)
            {
                AntdUiHelper.ShowInfo(FindForm(), "请先连接 RCon。", "提示");
                return;
            }

            int idx = AntdTableHelper.GetSelectedRowIndex(missionsTable);
            if (idx < 0 || idx >= missionRows.Count)
            {
                AntdUiHelper.ShowInfo(FindForm(), "请先选择一个任务。", "提示");
                return;
            }

            try
            {
                string missionName = BuildMissionParameter(missionRows[idx]);
                await appServices.RconService.LoadMissionAsync(missionName).ConfigureAwait(true);
                AntdUiHelper.ShowInfo(FindForm(), "已发送加载任务命令: " + missionName, "完成");
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "加载任务失败");
            }
        }

        private RconPlayerRow GetSelectedPlayerRow()
        {
            int idx = AntdTableHelper.GetSelectedRowIndex(playersTable);
            if (idx < 0 || idx >= playerRows.Count)
            {
                AntdUiHelper.ShowInfo(FindForm(), "请先选择一个在线玩家。", "提示");
                return null;
            }

            return playerRows[idx];
        }

        private static string BuildMissionParameter(RconMissionRow row)
        {
            if (row == null)
            {
                return string.Empty;
            }

            if (!string.IsNullOrWhiteSpace(row.Mission) && row.Mission.IndexOf('.') >= 0)
            {
                return row.Mission.Trim();
            }

            if (!string.IsNullOrWhiteSpace(row.Map) && !string.IsNullOrWhiteSpace(row.Mission))
            {
                return row.Map.Trim() + "." + row.Mission.Trim();
            }

            if (!string.IsNullOrWhiteSpace(row.Mission))
            {
                return row.Mission.Trim();
            }

            return row.Map != null ? row.Map.Trim() : string.Empty;
        }

        private string ResolveRconHost()
        {
            if (boundConfig == null || boundConfig.BattlEyeConfig == null)
            {
                return "127.0.0.1";
            }

            string host = boundConfig.BattlEyeConfig.RConHost;
            if (string.IsNullOrWhiteSpace(host))
            {
                return "127.0.0.1";
            }

            return host.Trim();
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
                await appServices.RconService.RemoveBanAsync(banId).ConfigureAwait(true);
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
                await appServices.RconService.SendMessageAsync(broadcastInput.Text.Trim()).ConfigureAwait(true);
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
                await appServices.RconService.SendMessageToPlayerAsync(playerId, playerMessageInput.Text.Trim()).ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "发送失败");
            }
        }

        private async Task LoadPlayersAsync()
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            if (!connected)
            {
                bool changed = false;
                if (playerRows.Count > 0)
                {
                    playerRows.Clear();
                    AntdTableHelper.BindList(playersTable, playerRows);
                    changed = true;
                }

                string disconnectedContext = "rows=0;changed=" + changed + ";connected=false";
                UiPerformanceProbe.LogDuration("Rcon.LoadPlayers", stopwatch.ElapsedMilliseconds, disconnectedContext);
                return;
            }

            IReadOnlyList<Player> players = await appServices.RconService.GetPlayersAsync().ConfigureAwait(true);
            var newRows = new List<RconPlayerRow>();
            foreach (Player player in players)
            {
                string ip = string.Empty;
                if (player.RemoteEndpoint != null && player.RemoteEndpoint.Address != null)
                {
                    ip = player.RemoteEndpoint.Address.ToString();
                }

                newRows.Add(
                    new RconPlayerRow
                    {
                        Id = player.Id,
                        Name = player.Name,
                        Guid = player.Guid,
                        Ip = ip,
                    });
            }

            bool tableChanged = UpdatePlayersTable(newRows);
            string context = "rows=" + newRows.Count + ";changed=" + tableChanged + ";connected=true";
            UiPerformanceProbe.LogDuration("Rcon.LoadPlayers", stopwatch.ElapsedMilliseconds, context);
        }

        private async Task SyncPlayersAsync()
        {
            if (!connected)
            {
                return;
            }

            IReadOnlyList<Player> players = await appServices.RconService.GetPlayersAsync().ConfigureAwait(true);
            await Task.Run(delegate { appServices.PlayerDirectoryService.SyncPlayers(players); }).ConfigureAwait(true);
            AntdUiHelper.ShowInfo(FindForm(), "已将在线玩家同步到 " + ToolConstants.PlayersDatabaseFileName + "。", "完成");
        }

        private async Task LoadBansAsync()
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            if (!connected)
            {
                bool changed = false;
                if (banRows.Count > 0)
                {
                    banRows.Clear();
                    AntdTableHelper.BindList(bansTable, banRows);
                    changed = true;
                }

                string disconnectedContext = "rows=0;changed=" + changed + ";connected=false";
                UiPerformanceProbe.LogDuration("Rcon.LoadBans", stopwatch.ElapsedMilliseconds, disconnectedContext);
                return;
            }

            IReadOnlyList<PlayerBan> bans = await appServices.RconService.GetBansAsync().ConfigureAwait(true);
            var newRows = new List<RconBanRow>();
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

                newRows.Add(
                    new RconBanRow
                    {
                        Id = ban.Id,
                        Guid = guid,
                        Ip = ip,
                        Duration = duration,
                        Reason = ban.Reason,
                    });
            }

            bool tableChanged = UpdateBansTable(newRows);
            string context = "rows=" + newRows.Count + ";changed=" + tableChanged + ";connected=true";
            UiPerformanceProbe.LogDuration("Rcon.LoadBans", stopwatch.ElapsedMilliseconds, context);
        }

        private async Task LoadBansCommandAsync()
        {
            await appServices.RconService.LoadBansAsync().ConfigureAwait(true);
            await LoadBansAsync().ConfigureAwait(true);
        }

        private async Task SaveBansCommandAsync()
        {
            await appServices.RconService.SaveBansAsync().ConfigureAwait(true);
            AntdUiHelper.ShowInfo(FindForm(), "已执行 SaveBans。", "完成");
        }

        private async Task LoadMissionsAsync()
        {
            Stopwatch stopwatch = Stopwatch.StartNew();
            if (!connected)
            {
                bool changed = false;
                if (missionRows.Count > 0)
                {
                    missionRows.Clear();
                    AntdTableHelper.BindList(missionsTable, missionRows);
                    changed = true;
                }

                string disconnectedContext = "rows=0;changed=" + changed + ";connected=false";
                UiPerformanceProbe.LogDuration("Rcon.LoadMissions", stopwatch.ElapsedMilliseconds, disconnectedContext);
                return;
            }

            IReadOnlyList<Mission> missions = await appServices.RconService.GetMissionsAsync().ConfigureAwait(true);
            var newRows = new List<RconMissionRow>();
            foreach (Mission mission in missions)
            {
                newRows.Add(
                    new RconMissionRow
                    {
                        Map = mission.Map,
                        Mission = mission.Name,
                    });
            }

            bool tableChanged = UpdateMissionsTable(newRows);
            string context = "rows=" + newRows.Count + ";changed=" + tableChanged + ";connected=true";
            UiPerformanceProbe.LogDuration("Rcon.LoadMissions", stopwatch.ElapsedMilliseconds, context);
        }

        private async Task RestartMissionAsync()
        {
            await appServices.RconService.RestartMissionAsync().ConfigureAwait(true);
        }

        private async Task LockServerAsync()
        {
            await appServices.RconService.LockServerAsync().ConfigureAwait(true);
        }

        private async Task UnlockServerAsync()
        {
            await appServices.RconService.UnlockServerAsync().ConfigureAwait(true);
        }

        private async void RunSafeAsync(Func<Task> action)
        {
            if (!connected)
            {
                AntdUiHelper.ShowInfo(FindForm(), "请先连接 RCon。", "提示");
                return;
            }

            SetRconBusy(true);
            try
            {
                await action().ConfigureAwait(true);
            }
            catch (Exception ex)
            {
                AntdUiHelper.ShowError(FindForm(), ex.Message, "操作失败");
            }
            finally
            {
                SetRconBusy(false);
            }
        }

        private void SetRconBusy(bool busy)
        {
            connectButton.Enabled = !busy;
            refreshPlayersButton.Enabled = connected && !busy;
            kickButton.Enabled = connected && !busy;
            banTempButton.Enabled = connected && !busy;
            banPermButton.Enabled = connected && !busy;
            syncPlayersButton.Enabled = connected && !busy;
            refreshBansButton.Enabled = connected && !busy;
            removeBanButton.Enabled = connected && !busy;
            loadBansButton.Enabled = connected && !busy;
            saveBansButton.Enabled = connected && !busy;
            refreshMissionsButton.Enabled = connected && !busy;
            loadMissionButton.Enabled = connected && !busy;
            restartMissionButton.Enabled = connected && !busy;
            lockButton.Enabled = connected && !busy;
            unlockButton.Enabled = connected && !busy;
            sendAllButton.Enabled = connected && !busy;
            sendPlayerButton.Enabled = connected && !busy;
            changePasswordButton.Enabled = connected && !busy;
        }

        private void SetConnectedUi(bool isConnected)
        {
            refreshPlayersButton.Enabled = isConnected;
            kickButton.Enabled = isConnected;
            banTempButton.Enabled = isConnected;
            banPermButton.Enabled = isConnected;
            syncPlayersButton.Enabled = isConnected;
            refreshBansButton.Enabled = isConnected;
            removeBanButton.Enabled = isConnected;
            loadBansButton.Enabled = isConnected;
            saveBansButton.Enabled = isConnected;
            refreshMissionsButton.Enabled = isConnected;
            loadMissionButton.Enabled = isConnected;
            restartMissionButton.Enabled = isConnected;
            lockButton.Enabled = isConnected;
            unlockButton.Enabled = isConnected;
            sendAllButton.Enabled = isConnected;
            sendPlayerButton.Enabled = isConnected;
            changePasswordButton.Enabled = isConnected;
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

        private bool UpdatePlayersTable(List<RconPlayerRow> newRows)
        {
            if (ArePlayerRowsEqual(playerRows, newRows))
            {
                return false;
            }

            playerRows.Clear();
            for (int i = 0; i < newRows.Count; i++)
            {
                playerRows.Add(newRows[i]);
            }

            AntdTableHelper.BindList(playersTable, playerRows);
            return true;
        }

        private bool UpdateBansTable(List<RconBanRow> newRows)
        {
            if (AreBanRowsEqual(banRows, newRows))
            {
                return false;
            }

            banRows.Clear();
            for (int i = 0; i < newRows.Count; i++)
            {
                banRows.Add(newRows[i]);
            }

            AntdTableHelper.BindList(bansTable, banRows);
            return true;
        }

        private bool UpdateMissionsTable(List<RconMissionRow> newRows)
        {
            if (AreMissionRowsEqual(missionRows, newRows))
            {
                return false;
            }

            missionRows.Clear();
            for (int i = 0; i < newRows.Count; i++)
            {
                missionRows.Add(newRows[i]);
            }

            AntdTableHelper.BindList(missionsTable, missionRows);
            return true;
        }

        private static bool ArePlayerRowsEqual(List<RconPlayerRow> left, List<RconPlayerRow> right)
        {
            if (left.Count != right.Count)
            {
                return false;
            }

            for (int i = 0; i < left.Count; i++)
            {
                RconPlayerRow leftRow = left[i];
                RconPlayerRow rightRow = right[i];
                if (leftRow.Id != rightRow.Id)
                {
                    return false;
                }

                if (!string.Equals(leftRow.Name, rightRow.Name, StringComparison.Ordinal))
                {
                    return false;
                }

                if (!string.Equals(leftRow.Guid, rightRow.Guid, StringComparison.Ordinal))
                {
                    return false;
                }

                if (!string.Equals(leftRow.Ip, rightRow.Ip, StringComparison.Ordinal))
                {
                    return false;
                }
            }

            return true;
        }

        private static bool AreBanRowsEqual(List<RconBanRow> left, List<RconBanRow> right)
        {
            if (left.Count != right.Count)
            {
                return false;
            }

            for (int i = 0; i < left.Count; i++)
            {
                RconBanRow leftRow = left[i];
                RconBanRow rightRow = right[i];
                if (leftRow.Id != rightRow.Id)
                {
                    return false;
                }

                if (!string.Equals(leftRow.Guid, rightRow.Guid, StringComparison.Ordinal))
                {
                    return false;
                }

                if (!string.Equals(leftRow.Ip, rightRow.Ip, StringComparison.Ordinal))
                {
                    return false;
                }

                if (!string.Equals(leftRow.Duration, rightRow.Duration, StringComparison.Ordinal))
                {
                    return false;
                }

                if (!string.Equals(leftRow.Reason, rightRow.Reason, StringComparison.Ordinal))
                {
                    return false;
                }
            }

            return true;
        }

        private static bool AreMissionRowsEqual(List<RconMissionRow> left, List<RconMissionRow> right)
        {
            if (left.Count != right.Count)
            {
                return false;
            }

            for (int i = 0; i < left.Count; i++)
            {
                RconMissionRow leftRow = left[i];
                RconMissionRow rightRow = right[i];
                if (!string.Equals(leftRow.Map, rightRow.Map, StringComparison.Ordinal))
                {
                    return false;
                }

                if (!string.Equals(leftRow.Mission, rightRow.Mission, StringComparison.Ordinal))
                {
                    return false;
                }
            }

            return true;
        }
    }
}