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
        private readonly SemaphoreSlim connectionLock = new SemaphoreSlim(1, 1);

        public async Task ConnectAsync(string host, int port, string password, CancellationToken cancellationToken)
        {
            await connectionLock.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
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
            finally
            {
                connectionLock.Release();
            }
        }

        public async Task<IReadOnlyList<Player>> GetPlayersAsync()
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try
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
            finally
            {
                connectionLock.Release();
            }
        }

        public async Task KickAsync(int playerId, string reason)
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try
            {
                EnsureConnected();
                client.Send(new KickCommand(playerId, reason));
            }
            finally
            {
                connectionLock.Release();
            }
        }

        public async Task<IReadOnlyList<PlayerBan>> GetBansAsync()
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try
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
            finally
            {
                connectionLock.Release();
            }
        }

        public async Task BanGuidAsync(string guid, string reason, TimeSpan duration)
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try { EnsureConnected(); client.Send(new BanPlayerCommand(guid, reason, duration)); }
            finally { connectionLock.Release(); }
        }

        public async Task BanGuidPermanentAsync(string guid, string reason)
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try { EnsureConnected(); client.Send(new BanPlayerCommand(guid, reason)); }
            finally { connectionLock.Release(); }
        }

        public async Task BanOnlinePlayerAsync(string guid, string reason, TimeSpan duration)
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try { EnsureConnected(); client.Send(new BanOnlinePlayerCommand(guid, reason, duration)); }
            finally { connectionLock.Release(); }
        }

        public async Task BanOnlinePlayerPermanentAsync(string guid, string reason)
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try { EnsureConnected(); client.Send(new BanOnlinePlayerCommand(guid, reason)); }
            finally { connectionLock.Release(); }
        }

        public async Task RemoveBanAsync(int banId)
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try { EnsureConnected(); client.Send(new RemoveBanCommand(banId)); }
            finally { connectionLock.Release(); }
        }

        public async Task LoadBansAsync()
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try { EnsureConnected(); client.Send(new LoadBansCommand()); }
            finally { connectionLock.Release(); }
        }

        public async Task SaveBansAsync()
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try { EnsureConnected(); client.Send(new SaveBansCommand()); }
            finally { connectionLock.Release(); }
        }

        public async Task SendMessageAsync(string message)
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try { EnsureConnected(); client.Send(new SendMessageCommand(message)); }
            finally { connectionLock.Release(); }
        }

        public async Task SendMessageToPlayerAsync(int playerId, string message)
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try { EnsureConnected(); client.Send(new SendMessageCommand(playerId, message)); }
            finally { connectionLock.Release(); }
        }

        public async Task<IReadOnlyList<Mission>> GetMissionsAsync()
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try
            {
                EnsureConnected();
                var request = new GetMissionsRequest();
                (bool success, IEnumerable<Mission> missions) = await client
                    .FetchAsync<IEnumerable<Mission>, GetMissionsRequest>(request, CancellationToken.None)
                    .ConfigureAwait(false);
                if (!success)
                    throw new InvalidOperationException("获取任务列表失败。");
                return missions?.ToList() ?? new List<Mission>();
            }
            finally { connectionLock.Release(); }
        }

        public Task RestartMissionAsync()
        {
            return WithLock(() => { EnsureConnected(); client.Send(new RestartMissionCommand()); });
        }

        public Task LoadMissionAsync(string missionName)
        {
            return WithLock(() =>
            {
                EnsureConnected();
                if (string.IsNullOrWhiteSpace(missionName))
                    throw new ArgumentException("任务名称不能为空。", nameof(missionName));
                client.Send(new LoadMissionCommand(missionName.Trim()));
            });
        }

        public Task LockServerAsync()
        {
            return WithLock(() => { EnsureConnected(); client.Send(new LockServerCommand()); });
        }

        public Task UnlockServerAsync()
        {
            return WithLock(() => { EnsureConnected(); client.Send(new UnlockCommand()); });
        }

        public Task ChangeRconPasswordAsync(string newPassword)
        {
            return WithLock(() =>
            {
                EnsureConnected();
                if (string.IsNullOrWhiteSpace(newPassword))
                    throw new ArgumentException("新密码不能为空。", nameof(newPassword));
                client.Send(new ChangeRconPasswordCommand(newPassword.Trim()));
            });
        }

        private async Task WithLock(Action action)
        {
            await connectionLock.WaitAsync().ConfigureAwait(false);
            try { action(); }
            finally { connectionLock.Release(); }
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

