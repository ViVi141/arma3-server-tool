using System.Collections.Generic;

namespace Arma3ServerTools.Application.Automation
{
    public sealed class AutomationTaskDocument
    {
        public string TaskId { get; set; }

        public string ServerUuid { get; set; }

        public string ServerName { get; set; }

        public List<AutomationCommand> Commands { get; set; } = new List<AutomationCommand>();
    }

    public sealed class AutomationCommand
    {
        public string Action { get; set; }

        public string MissionTemplate { get; set; }

        public int MissionDifficulty { get; set; } = 3;

        public bool MissionWhitelist { get; set; }

        public bool RestartAfterMission { get; set; } = true;

        public List<ulong> ModIds { get; set; } = new List<ulong>();

        public bool EnableModsOnServer { get; set; } = true;

        public bool ScanModsAfterDownload { get; set; } = true;

        public bool CopyBikeys { get; set; } = true;

        public string RconMissionName { get; set; }
    }

    public sealed class AutomationStepResult
    {
        public string Action { get; set; }

        public bool Success { get; set; }

        public string Message { get; set; }
    }

    public sealed class AutomationRunResult
    {
        public bool Success { get; set; }

        public string Message { get; set; }

        public string ServerUuid { get; set; }

        public List<AutomationStepResult> Steps { get; set; } = new List<AutomationStepResult>();
    }

    public sealed class ServerAutomationStatus
    {
        public string ServerUuid { get; set; }

        public string ConfigName { get; set; }

        public string ServerDir { get; set; }

        public ServerRunStateLabel RunState { get; set; }

        public int ProcessId { get; set; }

        public string ActiveMissionTemplate { get; set; }

        public int EnabledModCount { get; set; }
    }

    public enum ServerRunStateLabel
    {
        Stopped = 0,
        Running = 1,
        Unknown = 2,
    }
}
