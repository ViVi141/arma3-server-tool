using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using BytexDigital.BattlEye.Rcon;
using BytexDigital.BattlEye.Rcon.Commands;
using BytexDigital.BattlEye.Rcon.Domain;

namespace Arma3ServerTools.Application.Services
{
    public sealed class RconService : IRconService
    {
        private RconClient client;

        public async Task ConnectAsync(string host, int port, string password, CancellationToken cancellationToken)
        {
            DisposeClient();
            client = new RconClient(host, port, password)
            {
                ReconnectOnFailure = false,
            };

            bool connectedOnFirstAttempt = await Task.Run(() => client.Connect(), cancellationToken)
                .ConfigureAwait(false);
            if (!connectedOnFirstAttempt)
            {
                throw new InvalidOperationException("无法连接到 BattlEye RCon。");
            }

            bool connected = await client.WaitUntilConnectedAsync(cancellationToken).ConfigureAwait(false);
            if (!connected)
            {
                throw new TimeoutException("连接 BattlEye RCon 超时。");
            }
        }

        public async Task<IReadOnlyList<Player>> GetPlayersAsync()
        {
            EnsureConnected();
            var request = new GetPlayersRequest();
            (bool success, List<Player> players) = await client
                .FetchAsync<List<Player>, GetPlayersRequest>(request, CancellationToken.None)
                .ConfigureAwait(false);

            if (!success)
            {
                throw new InvalidOperationException("获取玩家列表失败。");
            }

            return players ?? new List<Player>();
        }

        public Task KickAsync(int playerId, string reason)
        {
            EnsureConnected();
            client.Send(new KickCommand(playerId, reason));
            return Task.CompletedTask;
        }

        public async Task<IReadOnlyList<PlayerBan>> GetBansAsync()
        {
            EnsureConnected();
            var request = new GetBansRequest();
            (bool success, List<PlayerBan> bans) = await client
                .FetchAsync<List<PlayerBan>, GetBansRequest>(request, CancellationToken.None)
                .ConfigureAwait(false);

            if (!success)
            {
                throw new InvalidOperationException("获取封禁列表失败。");
            }

            return bans ?? new List<PlayerBan>();
        }

        public Task BanGuidAsync(string guid, string reason, TimeSpan duration)
        {
            EnsureConnected();
            client.Send(new BanPlayerCommand(guid, reason, duration));
            return Task.CompletedTask;
        }

        public Task BanGuidPermanentAsync(string guid, string reason)
        {
            EnsureConnected();
            client.Send(new BanPlayerCommand(guid, reason));
            return Task.CompletedTask;
        }

        public Task BanOnlinePlayerAsync(string guid, string reason, TimeSpan duration)
        {
            EnsureConnected();
            client.Send(new BanOnlinePlayerCommand(guid, reason, duration));
            return Task.CompletedTask;
        }

        public Task BanOnlinePlayerPermanentAsync(string guid, string reason)
        {
            EnsureConnected();
            client.Send(new BanOnlinePlayerCommand(guid, reason));
            return Task.CompletedTask;
        }

        public Task RemoveBanAsync(int banId)
        {
            EnsureConnected();
            client.Send(new RemoveBanCommand(banId));
            return Task.CompletedTask;
        }

        public Task LoadBansAsync()
        {
            EnsureConnected();
            client.Send(new LoadBansCommand());
            return Task.CompletedTask;
        }

        public Task SaveBansAsync()
        {
            EnsureConnected();
            client.Send(new SaveBansCommand());
            return Task.CompletedTask;
        }

        public Task SendMessageAsync(string message)
        {
            EnsureConnected();
            client.Send(new SendMessageCommand(message));
            return Task.CompletedTask;
        }

        public Task SendMessageToPlayerAsync(int playerId, string message)
        {
            EnsureConnected();
            client.Send(new SendMessageCommand(playerId, message));
            return Task.CompletedTask;
        }

        public async Task<IReadOnlyList<Mission>> GetMissionsAsync()
        {
            EnsureConnected();
            var request = new GetMissionsRequest();
            (bool success, IEnumerable<Mission> missions) = await client
                .FetchAsync<IEnumerable<Mission>, GetMissionsRequest>(request, CancellationToken.None)
                .ConfigureAwait(false);

            if (!success)
            {
                throw new InvalidOperationException("获取任务列表失败。");
            }

            var result = new List<Mission>();
            if (missions != null)
            {
                foreach (Mission mission in missions)
                {
                    result.Add(mission);
                }
            }

            return result;
        }

        public Task RestartMissionAsync()
        {
            EnsureConnected();
            client.Send(new RestartMissionCommand());
            return Task.CompletedTask;
        }

        public Task LoadMissionAsync(string missionName)
        {
            EnsureConnected();
            if (string.IsNullOrWhiteSpace(missionName))
            {
                throw new ArgumentException("任务名称不能为空。", nameof(missionName));
            }

            client.Send(new LoadMissionCommand(missionName.Trim()));
            return Task.CompletedTask;
        }

        public Task LockServerAsync()
        {
            EnsureConnected();
            client.Send(new LockServerCommand());
            return Task.CompletedTask;
        }

        public Task UnlockServerAsync()
        {
            EnsureConnected();
            client.Send(new UnlockCommand());
            return Task.CompletedTask;
        }

        public Task ChangeRconPasswordAsync(string newPassword)
        {
            EnsureConnected();
            if (string.IsNullOrWhiteSpace(newPassword))
            {
                throw new ArgumentException("新密码不能为空。", nameof(newPassword));
            }

            client.Send(new ChangeRconPasswordCommand(newPassword.Trim()));
            return Task.CompletedTask;
        }

        public void Dispose()
        {
            DisposeClient();
        }

        private void EnsureConnected()
        {
            if (client == null || !client.IsConnected)
            {
                throw new InvalidOperationException("RCon 未连接。");
            }
        }

        private void DisposeClient()
        {
            if (client != null)
            {
                client.Disconnect();
                client = null;
            }
        }
    }
}

