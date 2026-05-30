using System;
using System.IO;
using System.Text;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class MonitoringDeploymentService
    {
        private readonly IAppPaths paths;

        public MonitoringDeploymentService(IAppPaths paths)
        {
            this.paths = paths;
        }

        public OperationResult DeployIfEnabled(ArmaServerConfig config)
        {
            if (config == null || !config.ServerTaskManagement.EnableMonitor)
            {
                return OperationResult.Ok();
            }

            if (string.IsNullOrWhiteSpace(config.ServerDir))
            {
                return OperationResult.Fail("未配置服务器目录，无法部署监控组件。");
            }

            if (!Directory.Exists(config.ServerDir))
            {
                return OperationResult.Fail("服务器目录不存在: " + config.ServerDir);
            }

            string bundledDllPath = GetBundledDllPath();
            if (!File.Exists(bundledDllPath))
            {
                return OperationResult.Fail(
                    "未找到监控扩展 "
                    + ToolConstants.MonitoringExtensionDllFileName
                    + "。请先编译 DestinyServerMonitoring（Release|x64），或从完整发布包复制 monitoring-server 目录。");
            }

            string bundledModPath = GetBundledModPath();
            if (!Directory.Exists(bundledModPath))
            {
                return OperationResult.Fail(
                    "未找到监控模组 "
                    + ToolConstants.MonitoringServerModToken
                    + "。请确认主程序目录下存在 mod\\"
                    + ToolConstants.MonitoringServerModToken);
            }

            try
            {
                string targetDllPath = Path.Combine(
                    config.ServerDir,
                    ToolConstants.MonitoringExtensionDllFileName);
                CopyFileIfChanged(bundledDllPath, targetDllPath);

                string targetModPath = Path.Combine(
                    config.ServerDir,
                    ToolConstants.MonitoringServerModToken);
                CopyDirectoryIfChanged(bundledModPath, targetModPath);

                string initScriptPath = Path.Combine(
                    targetModPath,
                    "addons",
                    "a3st_monitor",
                    "fn_initFunctions.sqf");
                Directory.CreateDirectory(Path.GetDirectoryName(initScriptPath));
                string initScriptContent = BuildInitFunctionsScript(config);
                WriteTextIfChanged(initScriptPath, initScriptContent);

                return OperationResult.Ok();
            }
            catch (Exception ex)
            {
                return OperationResult.Fail("部署监控组件失败: " + ex.Message);
            }
        }

        public bool HasBundledAssets()
        {
            return File.Exists(GetBundledDllPath()) && Directory.Exists(GetBundledModPath());
        }

        public string GetBundledDllPath()
        {
            return Path.Combine(
                paths.ApplicationBase,
                ToolConstants.MonitoringBundledFolderName,
                ToolConstants.MonitoringExtensionDllFileName);
        }

        public string GetBundledModPath()
        {
            return Path.Combine(
                paths.ApplicationBase,
                ToolConstants.MonitoringModBundledFolderName,
                ToolConstants.MonitoringServerModToken);
        }

        public static string BuildInitFunctionsScript(ArmaServerConfig config)
        {
            ServerManagement management = config.ServerTaskManagement;
            string enableStatisticsLiteral = "false";
            if (management.EnableMonitoringService)
            {
                enableStatisticsLiteral = "true";
            }

            string restartInfo = EscapeSqfString(management.RestartInfo);
            string serverUuid = EscapeSqfString(config.ServerUUID);
            string commandPassword = EscapeSqfString(config.ServerConfig.ServerCommandPassword);

            var builder = new StringBuilder();
            builder.AppendLine("if (isServer) then {");
            builder.Append("	destiny_var_restartTime = ").Append(management.RestartTime).AppendLine(";");
            builder.Append("	destiny_var_restartInfo = '").Append(restartInfo).AppendLine("';");
            builder.Append("	destiny_var_restartLastTime = ").Append(management.RestartLastTime).AppendLine(";");
            builder.Append("	uiNamespace setVariable ['destiny_server_command_password',(compileFinal \"'")
                .Append(commandPassword)
                .AppendLine("'\")];");
            builder.Append("	destiny_var_enableStatistics = ").Append(enableStatisticsLiteral).AppendLine(";");
            builder.Append("	destiny_var_serverUUID = '").Append(serverUuid).AppendLine("';");
            builder.AppendLine("	[] call compileFinal preprocessFileLineNumbers \"\\a3st_monitor\\script\\destiny_fnc_monitoring_service.sqf\";");
            builder.AppendLine("};");
            return builder.ToString();
        }

        internal static void CopyFileIfChanged(string sourcePath, string destinationPath)
        {
            if (!File.Exists(sourcePath))
            {
                throw new FileNotFoundException(sourcePath);
            }

            if (File.Exists(destinationPath) && FilesHaveSameContent(sourcePath, destinationPath))
            {
                return;
            }

            File.Copy(sourcePath, destinationPath, true);
        }

        internal static void WriteTextIfChanged(string destinationPath, string content)
        {
            if (File.Exists(destinationPath))
            {
                string existing = File.ReadAllText(destinationPath, Encoding.UTF8);
                if (string.Equals(existing, content, StringComparison.Ordinal))
                {
                    return;
                }
            }

            File.WriteAllText(
                destinationPath,
                content,
                new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
        }

        private static string EscapeSqfString(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return string.Empty;
            }

            return value.Replace("'", "''");
        }

        private static void CopyDirectoryIfChanged(string sourceDirectory, string targetDirectory)
        {
            if (!Directory.Exists(sourceDirectory))
            {
                throw new DirectoryNotFoundException(sourceDirectory);
            }

            Directory.CreateDirectory(targetDirectory);
            foreach (string filePath in Directory.GetFiles(sourceDirectory, "*", SearchOption.AllDirectories))
            {
                string relativePath = filePath.Substring(sourceDirectory.Length).TrimStart(
                    Path.DirectorySeparatorChar,
                    Path.AltDirectorySeparatorChar);
                string destinationPath = Path.Combine(targetDirectory, relativePath);
                Directory.CreateDirectory(Path.GetDirectoryName(destinationPath));
                CopyFileIfChanged(filePath, destinationPath);
            }
        }

        private static bool FilesHaveSameContent(string leftPath, string rightPath)
        {
            FileInfo leftInfo = new FileInfo(leftPath);
            FileInfo rightInfo = new FileInfo(rightPath);
            if (leftInfo.Length != rightInfo.Length)
            {
                return false;
            }

            if (leftInfo.LastWriteTimeUtc == rightInfo.LastWriteTimeUtc)
            {
                return true;
            }

            const int bufferSize = 8192;
            using (FileStream leftStream = File.OpenRead(leftPath))
            using (FileStream rightStream = File.OpenRead(rightPath))
            {
                byte[] leftBuffer = new byte[bufferSize];
                byte[] rightBuffer = new byte[bufferSize];
                while (true)
                {
                    int leftRead = leftStream.Read(leftBuffer, 0, bufferSize);
                    int rightRead = rightStream.Read(rightBuffer, 0, bufferSize);
                    if (leftRead != rightRead)
                    {
                        return false;
                    }

                    if (leftRead == 0)
                    {
                        return true;
                    }

                    for (int i = 0; i < leftRead; i++)
                    {
                        if (leftBuffer[i] != rightBuffer[i])
                        {
                            return false;
                        }
                    }
                }
            }
        }
    }
}
