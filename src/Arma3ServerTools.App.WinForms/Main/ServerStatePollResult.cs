using Arma3ServerTools.Application.Services;

namespace Arma3ServerTools.App.WinForms.Main
{
    internal sealed class ServerStatePollResult
    {
        public ServerStatePollResult(string serverUuid, ServerRunState runState, bool persistedBySyncState)
        {
            ServerUuid = serverUuid;
            RunState = runState;
            PersistedBySyncState = persistedBySyncState;
        }

        public string ServerUuid { get; }

        public ServerRunState RunState { get; }

        public bool PersistedBySyncState { get; }
    }
}
