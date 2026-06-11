using System.Collections.Generic;

namespace Arma3ServerTools.Application.Automation
{
    public sealed class AutomationTaskDocument
    {
        public string TaskId { get; set; }

        public string ServerUuid { get; set; }

        public string ServerName { get; set; }

        public bool Async { get; set; }

        /// <summary>
        /// 任务级默认：各 command 未显式设置时，改配置后写入游戏目录（SaveAndWrite）。
        /// </summary>
        public bool WriteCfgAfter { get; set; }

        /// <summary>
        /// 任务级默认：各 command 未显式设置时，改配置后重启服务器（含 apply）。
        /// </summary>
        public bool RestartAfter { get; set; }

        /// <summary>
        /// 为 null 时：download_mods / import_mods_html 默认捕获 SteamCMD 文本供 AI 查看进度。
        /// 设为 false 则弹出 SteamCMD 窗口（便于 Steam Guard）。
        /// </summary>
        public bool? CaptureSteamCmdOutput { get; set; }

        public int SteamCmdTimeoutSeconds { get; set; } = 3600;

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
        /// 为 true 时同步运行 SteamCMD 并捕获 stdout/stderr。未设置时继承任务级 CaptureSteamCmdOutput（默认捕获）。
        /// </summary>
        public bool? CaptureSteamCmdOutput { get; set; }

        public int SteamCmdTimeoutSeconds { get; set; }

        /// <summary>由 AutomationCommandCoalescer 设置：合并了几条相邻 download_mods。</summary>
        public int CoalescedFromCount { get; set; }

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

        /// <summary>
        /// 为 true 时，在 save/enable_mods/disable_mods 等改配置步骤成功后追加写入 server.cfg（等同 GUI「写入服务器」SaveAndWrite）。
        /// </summary>
        public bool WriteCfgAfter { get; set; }

        /// <summary>
        /// 为 true 时，改配置后重启服务器（stop → apply → start；已含 apply，无需再设 writeCfgAfter）。
        /// </summary>
        public bool RestartAfter { get; set; }
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
