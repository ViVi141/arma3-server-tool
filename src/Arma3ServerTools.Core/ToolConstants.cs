namespace Arma3ServerTools.Core
{
    /// <summary>
    /// 工具在磁盘与 Arma 3 侧的命名约定（a3st_* 前缀）。
    /// </summary>
    public static class ToolConstants
    {
        public const string ProductName = "Arma3 Server Tools";

        public const string ServerConfigFolderName = "a3st_serverconfig";

        public const string StatisticsDatabaseFileName = "a3st_statistics.db";

        public const string PlayersDatabaseFileName = "a3st_players.db";

        public const string StatisticsSchemaFileName = "a3st_statistics.sql";

        public const string PlayersSchemaFileName = "a3st_players.sql";

        public const string PlayersTableName = "a3st_players";

        public const string MonitoringServerModToken = "@a3st_monitor";

        public const string MonitoringExtensionDllFileName = "DestinyServerMonitoring.dll";

        public const string MonitoringBundledFolderName = "monitoring-server";

        public const string MonitoringModBundledFolderName = "mod";

        public const string MonitoringHostWindowTitle = "A3-Arma3ServerTools-ProcessCommunicationModule";

        public const string DefaultRconPasswordPrefix = "a3st";

        public const string BattlEyeMissionClassPrefix = "A3ST_";
    }
}
