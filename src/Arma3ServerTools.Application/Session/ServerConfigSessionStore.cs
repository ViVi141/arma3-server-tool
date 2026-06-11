using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Session
{
    public sealed class ServerConfigSessionStore
    {
        private readonly IServerConfigService configService;
        private readonly ConcurrentDictionary<string, ServerConfigSession> sessions =
            new ConcurrentDictionary<string, ServerConfigSession>(StringComparer.Ordinal);

        public ServerConfigSessionStore(IServerConfigService configService)
        {
            this.configService = configService ?? throw new ArgumentNullException(nameof(configService));
        }

        public IReadOnlyList<ServerListItem> ListSummaries()
        {
            return configService.List();
        }

        public ServerConfigSession GetOrLoad(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                return null;
            }

            ServerConfigSession existing;
            if (sessions.TryGetValue(serverUuid, out existing))
            {
                return existing;
            }

            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return null;
            }

            var session = new ServerConfigSession(config);
            sessions[serverUuid] = session;
            return session;
        }

        public bool TryGet(string serverUuid, out ServerConfigSession session)
        {
            session = null;
            if (string.IsNullOrEmpty(serverUuid))
            {
                return false;
            }

            return sessions.TryGetValue(serverUuid, out session);
        }

        public void Register(ServerConfigSession session)
        {
            if (session == null || string.IsNullOrEmpty(session.ServerUuid))
            {
                return;
            }

            sessions[session.ServerUuid] = session;
        }

        public void Unload(string serverUuid)
        {
            if (string.IsNullOrEmpty(serverUuid))
            {
                return;
            }

            ServerConfigSession removed;
            sessions.TryRemove(serverUuid, out removed);
        }

        public void Clear()
        {
            sessions.Clear();
        }
    }
}
