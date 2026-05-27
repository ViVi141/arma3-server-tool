using System.Collections.Generic;

namespace Arma3ServerTools.Application.Automation
{
    public sealed class AutomationTaskDocument
    {
        public string TaskId { get; set; }

        public string ServerUuid { get; set; }

        public string ServerName { get; set; }

        public bool Async { get; set; }

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

        /// <summary>
        /// 为 true 时同步运行 SteamCMD 并捕获 stdout/stderr（写入 logs/steamcmd/），适合 Agent 读取文本。
        /// 需要 Steam Guard 时可能失败，可改用弹窗模式并 GET /api/v1/steamcmd/log 轮询安装目录 logs/。
        /// </summary>
        public bool CaptureSteamCmdOutput { get; set; }

        public int SteamCmdTimeoutSeconds { get; set; } = 1800;

        public bool CopyBikeys { get; set; } = true;

        public string RconMissionName { get; set; }

        public string CreateServerName { get; set; }

        public string CreateServerDir { get; set; }

        public string HtmlImportMode { get; set; }

        public string HtmlContent { get; set; }

        public int PlayerId { get; set; }

        public string Reason { get; set; }

        public string PlayerGuid { get; set; }

        public string BroadcastMessage { get; set; }

        public string CronJobsJson { get; set; }

        public string LocalBanGuid { get; set; }

        public string LocalBanExpiry { get; set; }

        /// <summary>rpt | battleye | all | latest</summary>
        public string LogKind { get; set; }

        public int LogTailLines { get; set; } = 200;

        /// <summary>仅文件名（如 arma3server_2026-05-27_12-00-00.rpt），禁止 .. 与绝对路径越界。</summary>
        public string LogFileName { get; set; }
    }

    public sealed class AutomationStepResult
    {
        public string Action { get; set; }

        public bool Success { get; set; }

        public string Message { get; set; }

        public string SteamCmdLog { get; set; }

        public string SteamCmdLogFile { get; set; }

        public string GameLogPath { get; set; }

        public string GameLogContent { get; set; }
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
