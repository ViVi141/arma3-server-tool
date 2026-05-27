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

        public static Task<OperationResult> DownloadBundledSteamCmdAsync(
            IAppPaths paths,
            CancellationToken cancellationToken)
        {
            return DownloadBundledSteamCmdAsync(paths, cancellationToken, null);
        }

        public static async Task<OperationResult> DownloadBundledSteamCmdAsync(
            IAppPaths paths,
            CancellationToken cancellationToken,
            IProgress<SteamCmdDownloadProgress> progress)
        {
            string extensionDir = GetBundledDirectory(paths);
            if (IsInstallationComplete(extensionDir))
            {
                return OperationResult.Ok("SteamCMD 已存在于: " + GetBundledExecutablePath(paths));
            }

            try
            {
                Report(progress, "正在准备安装目录…", -1);
                if (Directory.Exists(extensionDir))
                {
                    Directory.Delete(extensionDir, true);
                }

                Directory.CreateDirectory(extensionDir);
                string zipPath = Path.Combine(extensionDir, "steamcmd.zip");
                OperationResult downloadResult = await DownloadZipAsync(zipPath, cancellationToken, progress)
                    .ConfigureAwait(false);
                if (!downloadResult.Success)
                {
                    return downloadResult;
                }

                Report(progress, "正在解压 steamcmd.zip…", -1);
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

                Report(progress, "正在初始化 SteamCMD（首次运行，可能需要数分钟）…", -1);
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

                Report(progress, "SteamCMD 安装完成", 100);
                return OperationResult.Ok("SteamCMD 已下载到: " + executablePath);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return OperationResult.Fail("下载 SteamCMD 失败: " + ex.Message);
            }
        }

        private static async Task<OperationResult> DownloadZipAsync(
            string zipPath,
            CancellationToken cancellationToken,
            IProgress<SteamCmdDownloadProgress> progress)
        {
            Report(progress, "正在连接 Steam CDN…", 0);
            using (HttpResponseMessage response = await SharedHttpClient
                .GetAsync(DownloadUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
                .ConfigureAwait(false))
            {
                response.EnsureSuccessStatusCode();
                long totalBytes = response.Content.Headers.ContentLength ?? -1;
                using (Stream contentStream = await response.Content.ReadAsStreamAsync(cancellationToken)
                    .ConfigureAwait(false))
                using (FileStream fileStream = new FileStream(
                    zipPath,
                    FileMode.Create,
                    FileAccess.Write,
                    FileShare.None,
                    bufferSize: 81920,
                    useAsync: true))
                {
                    byte[] buffer = new byte[81920];
                    long bytesRead = 0;
                    while (true)
                    {
                        int read = await contentStream.ReadAsync(buffer, 0, buffer.Length, cancellationToken)
                            .ConfigureAwait(false);
                        if (read == 0)
                        {
                            break;
                        }

                        await fileStream.WriteAsync(buffer, 0, read, cancellationToken).ConfigureAwait(false);
                        bytesRead += read;
                        if (totalBytes > 0)
                        {
                            int percent = (int)((bytesRead * 100L) / totalBytes);
                            if (percent > 99)
                            {
                                percent = 99;
                            }

                            Report(
                                progress,
                                "正在下载 steamcmd.zip（" + percent + "%）…",
                                percent);
                        }
                        else
                        {
                            Report(
                                progress,
                                "正在下载 steamcmd.zip（已下载 "
                                    + FormatByteSize(bytesRead)
                                    + "）…",
                                -1);
                        }
                    }
                }
            }

            return OperationResult.Ok();
        }

        private static string FormatByteSize(long bytes)
        {
            if (bytes < 1024)
            {
                return bytes + " B";
            }

            if (bytes < 1024 * 1024)
            {
                return (bytes / 1024) + " KB";
            }

            return (bytes / (1024 * 1024)) + " MB";
        }

        private static void Report(IProgress<SteamCmdDownloadProgress> progress, string stage, int percent)
        {
            if (progress == null)
            {
                return;
            }

            progress.Report(new SteamCmdDownloadProgress(stage, percent));
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
