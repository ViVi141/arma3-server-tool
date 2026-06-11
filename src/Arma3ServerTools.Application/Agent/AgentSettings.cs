using System.Collections.Generic;

namespace Arma3ServerTools.Application.Agent
{
    /// <summary>
    /// Automation API settings persisted as config/agent/settings.json.
    /// </summary>
    public sealed class AgentSettings
    {
        public AgentHttpSettings Http { get; set; } = new AgentHttpSettings();

        public AgentInboxSettings Inbox { get; set; } = new AgentInboxSettings();

        public AgentFileUploadSettings FileUpload { get; set; } = new AgentFileUploadSettings();

        public AgentSteamCmdSettings SteamCmd { get; set; } = new AgentSteamCmdSettings();
    }

    public sealed class AgentSteamCmdSettings
    {
        public bool MirrorOutputToConsole { get; set; } = true;
    }

    public sealed class AgentFileUploadSettings
    {
        public long MaxPboBytes { get; set; } = 524288000;

        public long MaxHtmlBytes { get; set; } = 5242880;
    }

    public sealed class AgentHttpSettings
    {
        public bool Enabled { get; set; } = true;

        public bool RemoteAccessEnabled { get; set; }

        public string ListenHost { get; set; } = "127.0.0.1";

        public int ListenPort { get; set; } = 19580;

        public string ListenPrefix { get; set; } = string.Empty;

        public string PublicBaseUrl { get; set; } = string.Empty;

        public string ApiToken { get; set; } = string.Empty;

        public List<string> AllowedCallerIps { get; set; } = new List<string>();
    }

    public sealed class AgentInboxSettings
    {
        public bool Enabled { get; set; } = true;

        public int PollSeconds { get; set; } = 5;
    }
}
