using Arma3ServerTools.Application.Services;

namespace Arma3ServerTools.App.WinForms.Main
{
    internal sealed class ServerStatePollResult
    {
        public ServerStatePollResult(string serverUuid, ServerRunState runState)
        {
            ServerUuid = serverUuid;
            RunState = runState;
        }

        public string ServerUuid { get; }

        public ServerRunState RunState { get; }
    }
}
