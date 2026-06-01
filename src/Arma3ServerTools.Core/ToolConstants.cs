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

        public const int MonitoringCopyDataSignature = 0x41335354;

        public const string DefaultRconPasswordPrefix = "a3st";

        public static string GenerateDefaultRconPassword()
        {
            byte[] bytes = new byte[4];
            System.Security.Cryptography.RandomNumberGenerator.Fill(bytes);
            int value = System.Math.Abs(System.BitConverter.ToInt32(bytes, 0)) % 100000000;
            return DefaultRconPasswordPrefix + value.ToString("D8");
        }

        public const string BattlEyeMissionClassPrefix = "A3ST_";

        /// <summary>Per-server tool config package format (directory under config/).</summary>
        public const int ToolConfigFormatVersion = 2;

        public const string ToolConfigManifestFileName = "manifest.json";

        public const string ToolConfigServerFileName = "server.json";

        public const string ToolConfigStartupFileName = "startup.json";

        public const string ToolConfigModsFileName = "mods.json";

        public const string ToolConfigBasicFileName = "basic.json";

        public const string ToolConfigProfileFileName = "profile.json";

        public const string ToolConfigBattlEyeFileName = "battleye.json";

        public const string ToolConfigTasksFileName = "tasks.json";

        public const string ToolConfigMissionParamsFileName = "missionparams.json";

        public const string LegacyConfigFileExtension = ".json";
    }
}
