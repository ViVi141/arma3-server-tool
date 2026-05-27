using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.Application.Services
{
    internal static class SteamCmdProcessRunner
    {
        public static SteamCmdRunResult RunCaptured(
            IAppPaths paths,
            string executablePath,
            string arguments,
            string passwordForRedaction,
            int timeoutMilliseconds)
        {
            var result = new SteamCmdRunResult();
            if (string.IsNullOrWhiteSpace(executablePath) || !File.Exists(executablePath))
            {
                result.Success = false;
                result.Message = "找不到 steamcmd.exe。";
                return result;
            }

            string workingDirectory = Path.GetDirectoryName(executablePath);
            string logDirectory = Path.Combine(paths.LogDirectory, "steamcmd");
            Directory.CreateDirectory(logDirectory);
            string logFilePath = Path.Combine(
                logDirectory,
                "steamcmd_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".log");
            result.LogFilePath = logFilePath;

            var stdoutBuilder = new StringBuilder();
            var stderrBuilder = new StringBuilder();
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = executablePath,
                    Arguments = arguments,
                    WorkingDirectory = workingDirectory,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8,
                };

                using (var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true })
                {
                    process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (e.Data != null)
                        {
                            stdoutBuilder.AppendLine(e.Data);
                        }
                    };
                    process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (e.Data != null)
                        {
                            stderrBuilder.AppendLine(e.Data);
                        }
                    };

                    if (!process.Start())
                    {
                        result.Success = false;
                        result.Message = "无法启动 SteamCMD 进程。";
                        return result;
                    }

                    process.BeginOutputReadLine();
                    process.BeginErrorReadLine();

                    bool exited = process.WaitForExit(timeoutMilliseconds);
                    if (!exited)
                    {
                        try
                        {
                            process.Kill(entireProcessTree: true);
                        }
                        catch (Exception)
                        {
                        }

                        result.Success = false;
                        result.ExitCode = -1;
                        result.Message = "SteamCMD 执行超时（" + (timeoutMilliseconds / 1000) + " 秒）。";
                    }
                    else
                    {
                        result.ExitCode = process.ExitCode;
                        result.Success = process.ExitCode == 0;
                        if (result.Success)
                        {
                            result.Message = "SteamCMD 执行完成。";
                        }
                        else
                        {
                            result.Message = "SteamCMD 退出码: " + process.ExitCode;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                result.Success = false;
                result.Message = "SteamCMD 执行失败: " + ex.Message;
            }

            result.StandardOutput = stdoutBuilder.ToString();
            result.StandardError = stderrBuilder.ToString();
            result.CombinedText = BuildCombinedText(result.StandardOutput, result.StandardError);
            WriteLogFile(logFilePath, executablePath, arguments, passwordForRedaction, result);
            return result;
        }

        private static string BuildCombinedText(string stdout, string stderr)
        {
            var builder = new StringBuilder();
            if (!string.IsNullOrWhiteSpace(stdout))
            {
                builder.AppendLine("--- stdout ---");
                builder.AppendLine(stdout.TrimEnd());
            }

            if (!string.IsNullOrWhiteSpace(stderr))
            {
                if (builder.Length > 0)
                {
                    builder.AppendLine();
                }

                builder.AppendLine("--- stderr ---");
                builder.AppendLine(stderr.TrimEnd());
            }

            return builder.ToString().TrimEnd();
        }

        private static void WriteLogFile(
            string logFilePath,
            string executablePath,
            string arguments,
            string passwordForRedaction,
            SteamCmdRunResult result)
        {
            string safeArgs = RedactPassword(arguments, passwordForRedaction);
            var builder = new StringBuilder();
            builder.AppendLine("时间: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
            builder.AppendLine("程序: " + executablePath);
            builder.AppendLine("参数: " + safeArgs);
            builder.AppendLine("退出码: " + result.ExitCode);
            builder.AppendLine("成功: " + result.Success);
            builder.AppendLine("消息: " + result.Message);
            builder.AppendLine();
            builder.AppendLine(result.CombinedText);
            try
            {
                File.WriteAllText(logFilePath, builder.ToString(), Encoding.UTF8);
            }
            catch (Exception)
            {
            }
        }

        private static string RedactPassword(string arguments, string password)
        {
            if (string.IsNullOrEmpty(arguments) || string.IsNullOrEmpty(password))
            {
                return arguments;
            }

            return arguments.Replace(password, "***");
        }
    }
}
