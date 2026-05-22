using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using BytexDigital.BattlEye.Rcon;
using BytexDigital.BattlEye.Rcon.Commands;
using BytexDigital.BattlEye.Rcon.Domain;

namespace Arma3ServerTools.Application.Services
{
    public sealed class RconQuickProbe
    {
        public async Task<int?> TryGetOnlinePlayerCountAsync(
            string host,
            int port,
            string password,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(password))
            {
                return null;
            }

            if (port <= 0 || port > 65535)
            {
                return null;
            }

            string resolvedHost = host;
            if (string.IsNullOrWhiteSpace(resolvedHost))
            {
                resolvedHost = "127.0.0.1";
            }

            RconClient client = null;
            try
            {
                client = new RconClient(resolvedHost.Trim(), port, password.Trim())
                {
                    ReconnectOnFailure = false,
                };

                bool connectedOnFirstAttempt = await Task.Run(() => client.Connect(), cancellationToken)
                    .ConfigureAwait(false);
                if (!connectedOnFirstAttempt)
                {
                    return null;
                }

                bool connected = await client.WaitUntilConnectedAsync(cancellationToken).ConfigureAwait(false);
                if (!connected)
                {
                    return null;
                }

                var request = new GetPlayersRequest();
                (bool success, List<Player> players) = await client
                    .FetchAsync<List<Player>, GetPlayersRequest>(request, cancellationToken)
                    .ConfigureAwait(false);
                if (!success || players == null)
                {
                    return null;
                }

                return players.Count;
            }
            catch
            {
                return null;
            }
            finally
            {
                if (client != null)
                {
                    client.Disconnect();
                }
            }
        }
    }
}
