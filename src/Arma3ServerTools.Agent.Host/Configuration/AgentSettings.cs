using System.Collections.Generic;

namespace Arma3ServerTools.Agent.Host.Configuration
{
    /// <summary>
    /// Automation API settings. IM is handled by OpenClaw on another machine; this host executes on the game server machine.
    /// </summary>
    public sealed class AgentSettings
    {
        public AgentHttpSettings Http { get; set; } = new AgentHttpSettings();

        public AgentInboxSettings Inbox { get; set; } = new AgentInboxSettings();

        public AgentFileUploadSettings FileUpload { get; set; } = new AgentFileUploadSettings();
    }

    public sealed class AgentFileUploadSettings
    {
        public long MaxPboBytes { get; set; } = 524288000;

        public long MaxHtmlBytes { get; set; } = 5242880;
    }

    public sealed class AgentHttpSettings
    {
        public bool Enabled { get; set; } = true;

        /// <summary>
        /// When true, listens on LAN/all interfaces (see ListenHost). Required for OpenClaw on another host (B) to reach this agent (A).
        /// </summary>
        public bool RemoteAccessEnabled { get; set; }

        /// <summary>
        /// Listen host: 127.0.0.1 (local), machine IP, or + for all interfaces (Windows urlacl required).
        /// Ignored when ListenPrefix is set.
        /// </summary>
        public string ListenHost { get; set; } = "127.0.0.1";

        public int ListenPort { get; set; } = 19580;

        /// <summary>
        /// Optional full prefix override, e.g. http://192.168.1.10:19580/
        /// </summary>
        public string ListenPrefix { get; set; } = string.Empty;

        /// <summary>
        /// URL shown in logs / docs for remote clients (OpenClaw on B). Example: http://192.168.1.10:19580
        /// </summary>
        public string PublicBaseUrl { get; set; } = string.Empty;

        public string ApiToken { get; set; } = string.Empty;

        /// <summary>
        /// When RemoteAccessEnabled, optional allowlist of caller IPv4 (e.g. OpenClaw host B). Empty = any remote (not recommended).
        /// </summary>
        public List<string> AllowedCallerIps { get; set; } = new List<string>();
    }

    public sealed class AgentInboxSettings
    {
        public bool Enabled { get; set; } = true;

        public int PollSeconds { get; set; } = 5;
    }
}
