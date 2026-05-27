using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdLogService
    {
        private static readonly string[] InstallLogFileNames =
        {
            "content_log.txt",
            "stderr.txt",
            "bootstrap_log.txt",
            "connection_log.txt",
            "console_log.txt",
        };

        private readonly IAppPaths paths;
        private readonly ISteamCmdConfigProvider configProvider;

        public SteamCmdLogService(IAppPaths paths, ISteamCmdConfigProvider configProvider)
        {
            this.paths = paths;
            this.configProvider = configProvider;
        }

        public string GetSessionLogDirectory()
        {
            return Path.Combine(paths.LogDirectory, "steamcmd");
        }

        public string GetLatestSessionLogFilePath()
        {
            string directory = GetSessionLogDirectory();
            if (!Directory.Exists(directory))
            {
                return string.Empty;
            }

            string[] files = Directory.GetFiles(directory, "steamcmd_*.log");
            if (files.Length == 0)
            {
                return string.Empty;
            }

            Array.Sort(files, StringComparer.OrdinalIgnoreCase);
            return files[files.Length - 1];
        }

        public string ReadLatestSessionLog(int maxLines)
        {
            string latest = GetLatestSessionLogFilePath();
            if (string.IsNullOrEmpty(latest))
            {
                return string.Empty;
            }

            return ReadTailLines(latest, maxLines);
        }

        public string ReadSteamCmdInstallLogs(int maxLinesPerFile)
        {
            string installDir = ResolveSteamCmdInstallDirectory();
            if (string.IsNullOrEmpty(installDir))
            {
                return string.Empty;
            }

            string logsDir = Path.Combine(installDir, "logs");
            if (!Directory.Exists(logsDir))
            {
                return string.Empty;
            }

            var builder = new StringBuilder();
            for (int i = 0; i < InstallLogFileNames.Length; i++)
            {
                string filePath = Path.Combine(logsDir, InstallLogFileNames[i]);
                if (!File.Exists(filePath))
                {
                    continue;
                }

                builder.AppendLine("=== " + InstallLogFileNames[i] + " ===");
                builder.AppendLine(ReadTailLines(filePath, maxLinesPerFile));
                builder.AppendLine();
            }

            return builder.ToString().TrimEnd();
        }

        public string ReadAggregatedLog(int maxLines)
        {
            var builder = new StringBuilder();
            string session = ReadLatestSessionLog(maxLines);
            if (!string.IsNullOrWhiteSpace(session))
            {
                builder.AppendLine("=== 工具捕获的 SteamCMD 输出（最近一次） ===");
                builder.AppendLine(session);
                builder.AppendLine();
            }

            string install = ReadSteamCmdInstallLogs(maxLines);
            if (!string.IsNullOrWhiteSpace(install))
            {
                builder.AppendLine("=== SteamCMD 安装目录 logs/ ===");
                builder.AppendLine(install);
            }

            return builder.ToString().TrimEnd();
        }

        public string ResolveSteamCmdInstallDirectory()
        {
            string bundled = SteamCmdBootstrapper.GetBundledDirectory(paths);
            if (Directory.Exists(Path.Combine(bundled, "logs"))
                || File.Exists(Path.Combine(bundled, "steamcmd.exe")))
            {
                return bundled;
            }

            SteamcmdEntity settings = configProvider.GetSettings();
            if (settings != null && !string.IsNullOrWhiteSpace(settings.d))
            {
                return settings.d.Trim();
            }

            return string.Empty;
        }

        private static string ReadTailLines(string filePath, int maxLines)
        {
            if (maxLines < 1)
            {
                maxLines = 200;
            }

            try
            {
                string[] allLines = File.ReadAllLines(filePath);
                if (allLines.Length <= maxLines)
                {
                    return string.Join(Environment.NewLine, allLines);
                }

                var tail = new List<string>();
                int start = allLines.Length - maxLines;
                for (int i = start; i < allLines.Length; i++)
                {
                    tail.Add(allLines[i]);
                }

                return string.Join(Environment.NewLine, tail);
            }
            catch (Exception ex)
            {
                return "无法读取日志: " + ex.Message;
            }
        }
    }
}
