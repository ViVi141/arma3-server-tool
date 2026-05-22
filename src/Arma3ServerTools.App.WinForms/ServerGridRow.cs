using Arma3ServerTools.Application.Services;

namespace Arma3ServerTools.App.WinForms
{
    internal sealed class ServerGridRow
    {
        public string ConfigName { get; set; }

        public string ServerUuid { get; set; }

        public string SaveTime { get; set; }

        public ServerRunState RunState { get; set; }

        public string State
        {
            get
            {
                string text = ServerRunStateFormatter.ToDisplay(RunState);
                if (RunState == ServerRunState.Running)
                {
                    return "● " + text;
                }

                return text;
            }
        }
    }
}
