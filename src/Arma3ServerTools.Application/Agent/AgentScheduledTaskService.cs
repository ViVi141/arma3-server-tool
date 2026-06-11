using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.Application.Agent
{
    public sealed class AgentScheduledTaskService
    {
        public const string TaskName = "Arma3 Server Tools Agent";

        private readonly AgentSettingsService agentSettingsService;

        public AgentScheduledTaskService(AgentSettingsService agentSettingsService)
        {
            this.agentSettingsService = agentSettingsService
                ?? throw new ArgumentNullException(nameof(agentSettingsService));
        }

        public bool IsAutoStartRegistered()
        {
            OperationResult result = RunSchTasks(
                string.Format(CultureInfo.InvariantCulture, "/Query /TN \"{0}\" /FO LIST", TaskName));
            return result.Success;
        }

        public OperationResult RegisterAutoStart()
        {
            string exePath = agentSettingsService.ResolveAgentExecutablePath();
            if (!File.Exists(exePath))
            {
                return OperationResult.Fail("未找到 Agent 程序: " + exePath);
            }

            string arguments = string.Format(
                CultureInfo.InvariantCulture,
                "/Create /F /TN \"{0}\" /TR \"\\\"{1}\\\"\" /SC ONLOGON /RL LIMITED",
                TaskName,
                exePath);
            OperationResult createResult = RunSchTasks(arguments);
            if (!createResult.Success)
            {
                return createResult;
            }

            return OperationResult.Ok(
                "已注册计划任务「" + TaskName + "」。"
                + "下次登录 Windows 时将自动启动 Agent。");
        }

        public OperationResult UnregisterAutoStart()
        {
            if (!IsAutoStartRegistered())
            {
                return OperationResult.Ok("计划任务尚未注册。");
            }

            string arguments = string.Format(
                CultureInfo.InvariantCulture,
                "/Delete /F /TN \"{0}\"",
                TaskName);
            OperationResult deleteResult = RunSchTasks(arguments);
            if (!deleteResult.Success)
            {
                return deleteResult;
            }

            return OperationResult.Ok("已取消登录时自动启动 Agent。");
        }

        public OperationResult RunScheduledTaskNow()
        {
            if (!IsAutoStartRegistered())
            {
                return OperationResult.Fail("计划任务尚未注册。");
            }

            string arguments = string.Format(
                CultureInfo.InvariantCulture,
                "/Run /TN \"{0}\"",
                TaskName);
            return RunSchTasks(arguments);
        }

        private static OperationResult RunSchTasks(string arguments)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "schtasks.exe",
                    Arguments = arguments,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                };

                using (Process process = Process.Start(startInfo))
                {
                    if (process == null)
                    {
                        return OperationResult.Fail("无法启动 schtasks.exe。");
                    }

                    string output = process.StandardOutput.ReadToEnd();
                    string error = process.StandardError.ReadToEnd();
                    process.WaitForExit();
                    string combined = (output + Environment.NewLine + error).Trim();
                    if (process.ExitCode != 0)
                    {
                        if (string.IsNullOrEmpty(combined))
                        {
                            combined = "exit code " + process.ExitCode;
                        }

                        return OperationResult.Fail(combined);
                    }

                    if (string.IsNullOrEmpty(combined))
                    {
                        return OperationResult.Ok();
                    }

                    return OperationResult.Ok(combined);
                }
            }
            catch (Exception ex)
            {
                return OperationResult.Fail("执行 schtasks 失败: " + ex.Message);
            }
        }
    }
}
