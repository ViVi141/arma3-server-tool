using System;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.Application.Services
{
    public static class SteamCmdBootstrapper
    {
        public const string DownloadUrl = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";

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

        public static OperationResult DownloadBundledSteamCmd(IAppPaths paths)
        {
            return DownloadBundledSteamCmdAsync(paths, CancellationToken.None).GetAwaiter().GetResult();
        }

        public static async Task<OperationResult> DownloadBundledSteamCmdAsync(
            IAppPaths paths,
            CancellationToken cancellationToken)
        {
            string extensionDir = GetBundledDirectory(paths);
            string executablePath = GetBundledExecutablePath(paths);
            if (File.Exists(executablePath))
            {
                return OperationResult.Ok("SteamCMD 已存在于: " + executablePath);
            }

            string zipPath = Path.Combine(extensionDir, "steamcmd.zip");

            try
            {
                Directory.CreateDirectory(extensionDir);
                byte[] zipBytes = await SharedHttpClient
                    .GetByteArrayAsync(DownloadUrl, cancellationToken)
                    .ConfigureAwait(false);
                await File.WriteAllBytesAsync(zipPath, zipBytes, cancellationToken).ConfigureAwait(false);

                ExtractZip(zipPath, extensionDir);
                if (File.Exists(zipPath))
                {
                    File.Delete(zipPath);
                }

                if (!File.Exists(executablePath))
                {
                    return OperationResult.Fail("解压完成但未找到 steamcmd.exe，请检查网络或手动下载。");
                }

                return OperationResult.Ok("SteamCMD 已下载到: " + executablePath);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                return OperationResult.Fail("下载 SteamCMD 失败: " + ex.Message);
            }
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
