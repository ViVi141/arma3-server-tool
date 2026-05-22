using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.Application.Services
{
    public static class SteamCmdBootstrapper
    {
        public const string DownloadUrl = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";

        private const string BootstrapperEnglishFile = "public\\steambootstrapper_english.txt";

        private static readonly HttpClient SharedHttpClient = new HttpClient
        {
            Timeout = TimeSpan.FromMinutes(5),
        };

        public static string GetBundledDirectory(IAppPaths paths)
        {
            return Path.Combine(paths.UserDataDirectory, "extension");
        }

        public static string GetBundledExecutablePath(IAppPaths paths)
        {
            return Path.Combine(GetBundledDirectory(paths), "steamcmd.exe");
        }

        public static bool IsInstallationComplete(string extensionDirectory)
        {
            if (string.IsNullOrWhiteSpace(extensionDirectory))
            {
                return false;
            }

            string executablePath = Path.Combine(extensionDirectory, "steamcmd.exe");
            string bootstrapperPath = Path.Combine(extensionDirectory, BootstrapperEnglishFile);
            return File.Exists(executablePath) && File.Exists(bootstrapperPath);
        }

        public static OperationResult DownloadBundledSteamCmd(IAppPaths paths)
        {
            return DownloadBundledSteamCmdAsync(paths, CancellationToken.None).GetAwaiter().GetResult();
        }

        public static async Task<OperationResult> DownloadBundledSteamCmdAsync(
            IAppPaths paths,
            CancellationToken cancellationToken)
        {
            string extensionDir = GetBundledDirectory(paths);
            if (IsInstallationComplete(extensionDir))
            {
                return OperationResult.Ok("SteamCMD 已存在于: " + GetBundledExecutablePath(paths));
            }

            try
            {
                if (Directory.Exists(extensionDir))
                {
                    Directory.Delete(extensionDir, true);
                }

                Directory.CreateDirectory(extensionDir);
                string zipPath = Path.Combine(extensionDir, "steamcmd.zip");
                byte[] zipBytes = await SharedHttpClient
                    .GetByteArrayAsync(DownloadUrl, cancellationToken)
                    .ConfigureAwait(false);
                await File.WriteAllBytesAsync(zipPath, zipBytes, cancellationToken).ConfigureAwait(false);

                ExtractZip(zipPath, extensionDir);
                if (File.Exists(zipPath))
                {
                    File.Delete(zipPath);
                }

                string executablePath = GetBundledExecutablePath(paths);
                if (!File.Exists(executablePath))
                {
                    return OperationResult.Fail("解压完成但未找到 steamcmd.exe，请检查网络或手动下载。");
                }

                OperationResult bootstrapResult = RunBootstrapUpdate(extensionDir);
                if (!bootstrapResult.Success)
                {
                    return bootstrapResult;
                }

                if (!IsInstallationComplete(extensionDir))
                {
                    return OperationResult.Fail(
                        "SteamCMD 初始化未完成，缺少 public 资源文件。"
                        + Environment.NewLine
                        + "请确认本机可访问 Steam CDN（steamcdn-a.akamaihd.net），"
                        + "或在关闭代理/更换网络后重试。"
                        + Environment.NewLine
                        + "目录: " + extensionDir);
                }

                return OperationResult.Ok("SteamCMD 已下载到: " + executablePath);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return OperationResult.Fail("下载 SteamCMD 失败: " + ex.Message);
            }
        }

        private static OperationResult RunBootstrapUpdate(string extensionDirectory)
        {
            string executablePath = Path.Combine(extensionDirectory, "steamcmd.exe");
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = executablePath,
                    Arguments = "+quit",
                    WorkingDirectory = extensionDirectory,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                };

                using (Process process = Process.Start(startInfo))
                {
                    if (process == null)
                    {
                        return OperationResult.Fail("无法启动 SteamCMD 进行初始化。");
                    }

                    string stderr = process.StandardError.ReadToEnd();
                    process.StandardOutput.ReadToEnd();
                    if (!process.WaitForExit(180000))
                    {
                        try
                        {
                            process.Kill();
                        }
                        catch (Exception)
                        {
                        }

                        return OperationResult.Fail("SteamCMD 初始化超时，请检查网络连接。");
                    }

                    if (IsInstallationComplete(extensionDirectory))
                    {
                        return OperationResult.Ok();
                    }

                    return OperationResult.Fail(BuildBootstrapFailureMessage(stderr, extensionDirectory));
                }
            }
            catch (Exception ex)
            {
                return OperationResult.Fail("SteamCMD 初始化失败: " + ex.Message);
            }
        }

        private static string BuildBootstrapFailureMessage(string stderr, string extensionDirectory)
        {
            var builder = new StringBuilder();
            builder.Append("SteamCMD 无法联机完成初始化。");
            if (!string.IsNullOrWhiteSpace(stderr)
                && (stderr.IndexOf("<!DOCTYPE", StringComparison.OrdinalIgnoreCase) >= 0
                    || stderr.IndexOf("HTTP Error", StringComparison.OrdinalIgnoreCase) >= 0
                    || stderr.IndexOf("502.3", StringComparison.OrdinalIgnoreCase) >= 0
                    || stderr.IndexOf("IIS", StringComparison.OrdinalIgnoreCase) >= 0))
            {
                builder.Append(Environment.NewLine);
                builder.Append("检测到网络/代理返回了 HTML 错误页，而非 Steam 更新文件。");
                builder.Append(Environment.NewLine);
                builder.Append("请关闭系统代理、允许访问 steamcdn-a.akamaihd.net，或手动将完整 SteamCMD 解压到:");
            }
            else
            {
                builder.Append(Environment.NewLine);
                builder.Append("请检查网络后重试，或手动将完整 SteamCMD 解压到:");
            }

            builder.Append(Environment.NewLine);
            builder.Append(extensionDirectory);
            return builder.ToString();
        }

        private static void ExtractZip(string zipPath, string destinationDirectory)
        {
            using (ZipArchive archive = ZipFile.OpenRead(zipPath))
            {
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    if (string.IsNullOrEmpty(entry.Name))
                    {
                        continue;
                    }

                    string targetPath = Path.Combine(destinationDirectory, entry.FullName);
                    string targetDirectory = Path.GetDirectoryName(targetPath);
                    if (!string.IsNullOrEmpty(targetDirectory))
                    {
                        Directory.CreateDirectory(targetDirectory);
                    }

                    entry.ExtractToFile(targetPath, true);
                }
            }
        }
    }
}
