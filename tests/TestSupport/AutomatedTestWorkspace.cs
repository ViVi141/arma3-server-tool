using System;
using System.IO;
using System.Threading;
using Arma3ServerTools.Core.Config;

namespace Arma3ServerTools.TestSupport
{
    public static class AutomatedTestWorkspace
    {
        public static string CreateRoot(string prefix)
        {
            string path = Path.Combine(Path.GetTempPath(), prefix + "-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(path);
            Directory.CreateDirectory(Path.Combine(path, "config"));
            return path;
        }

        public static void DeleteRoot(string path)
        {
            if (!Directory.Exists(path))
            {
                return;
            }

            for (int attempt = 0; attempt < 5; attempt++)
            {
                try
                {
                    Directory.Delete(path, true);
                    return;
                }
                catch (IOException)
                {
                    Thread.Sleep(50);
                }
            }

            Directory.Delete(path, true);
        }

        public static string FindSqlSchemaPath()
        {
            string[] candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "sql", Core.ToolConstants.StatisticsSchemaFileName),
                Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "sql", Core.ToolConstants.StatisticsSchemaFileName)),
                Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "sql", Core.ToolConstants.StatisticsSchemaFileName)),
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                if (File.Exists(candidates[i]))
                {
                    return candidates[i];
                }
            }

            throw new FileNotFoundException(
                "测试需要 sql/" + Core.ToolConstants.StatisticsSchemaFileName + "（输出目录或仓库 sql/ 下）。",
                candidates[0]);
        }

        public static void CopySqlSchema(string root)
        {
            string sqlSource = FindSqlSchemaPath();
            string sqlDestDir = Path.Combine(root, "sql");
            Directory.CreateDirectory(sqlDestDir);
            File.Copy(sqlSource, Path.Combine(sqlDestDir, Core.ToolConstants.StatisticsSchemaFileName), true);
        }

        public static void CreateFakeDedicatedServer(string serverDir)
        {
            Directory.CreateDirectory(serverDir);
            File.WriteAllText(Path.Combine(serverDir, "arma3server_x64.exe"), string.Empty);
        }

        public static void CreateBundledSteamCmd(string root)
        {
            CreateCompleteSteamCmdInstall(Path.Combine(root, "extension"));
        }

        public static void CreateCompleteSteamCmdInstall(string extensionDir)
        {
            Directory.CreateDirectory(extensionDir);
            File.WriteAllText(Path.Combine(extensionDir, "steamcmd.exe"), string.Empty);
            string publicDir = Path.Combine(extensionDir, "public");
            Directory.CreateDirectory(publicDir);
            File.WriteAllText(Path.Combine(publicDir, "steambootstrapper_english.txt"), "mock");
        }

        public static void CreateBundledMonitoringAssets(string root)
        {
            string dllDir = Path.Combine(root, Core.ToolConstants.MonitoringBundledFolderName);
            Directory.CreateDirectory(dllDir);
            File.WriteAllText(
                Path.Combine(dllDir, Core.ToolConstants.MonitoringExtensionDllFileName),
                "mock-monitoring-dll");

            string modRoot = Path.Combine(
                root,
                Core.ToolConstants.MonitoringModBundledFolderName,
                Core.ToolConstants.MonitoringServerModToken);
            string addonRoot = Path.Combine(modRoot, "addons", "a3st_monitor");
            Directory.CreateDirectory(addonRoot);
            File.WriteAllText(Path.Combine(addonRoot, "config.cpp"), "class CfgPatches {};");
            File.WriteAllText(Path.Combine(addonRoot, "fn_initFunctions.sqf"), "// template");
            Directory.CreateDirectory(Path.Combine(addonRoot, "script"));
            File.WriteAllText(
                Path.Combine(addonRoot, "script", "destiny_fnc_monitoring_service.sqf"),
                "// monitoring");
        }

        public static void CopyPlayersSchema(string root)
        {
            string source = Path.Combine(Path.GetDirectoryName(FindSqlSchemaPath()), Core.ToolConstants.PlayersSchemaFileName);
            if (!File.Exists(source))
            {
                throw new FileNotFoundException(
                    "测试需要 sql/" + Core.ToolConstants.PlayersSchemaFileName + "（与统计 schema 同目录）。",
                    source);
            }

            string destDir = Path.Combine(root, "sql");
            Directory.CreateDirectory(destDir);
            File.Copy(source, Path.Combine(destDir, Core.ToolConstants.PlayersSchemaFileName), true);
        }

        public static void CreateSampleMod(string modPath, string name, long publishedId)
        {
            Directory.CreateDirectory(Path.Combine(modPath, "addons"));
            string meta = "name = \"" + name + "\";" + Environment.NewLine
                + "publishedid = " + publishedId + ";" + Environment.NewLine
                + "timestamp = " + DateTime.Now.ToBinary() + ";";
            File.WriteAllText(Path.Combine(modPath, "meta.cpp"), meta);
        }

        public static int FindAvailableUdpPort()
        {
            for (int port = 30000; port <= 45000; port++)
            {
                if (!GameConfigWriter.IsPortInUse(port))
                {
                    return port;
                }
            }

            throw new InvalidOperationException("No available UDP port found for automated test.");
        }

        public static void WaitUntil(Func<bool> predicate, int timeoutMs, int intervalMs)
        {
            DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
            while (DateTime.UtcNow < deadline)
            {
                if (predicate())
                {
                    return;
                }

                Thread.Sleep(intervalMs);
            }

            throw new TimeoutException("Condition was not met within " + timeoutMs + " ms.");
        }
    }
}
