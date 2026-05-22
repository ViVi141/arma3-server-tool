using System;
using System.IO;
using System.IO.Compression;
using System.Net;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.Application.Services
{
    public static class SteamCmdBootstrapper
    {
        public const string DownloadUrl = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";

        public static string GetBundledDirectory(IAppPaths paths)
        {
            return Path.Combine(paths.ApplicationBase, "extension");
        }

        public static string GetBundledExecutablePath(IAppPaths paths)
        {
            return Path.Combine(GetBundledDirectory(paths), "steamcmd.exe");
        }

        public static OperationResult DownloadBundledSteamCmd(IAppPaths paths)
        {
            string extensionDir = GetBundledDirectory(paths);
            string executablePath = GetBundledExecutablePath(paths);
            string zipPath = Path.Combine(extensionDir, "steamcmd.zip");

            try
            {
                Directory.CreateDirectory(extensionDir);
                using (var client = new WebClient())
                {
                    client.DownloadFile(DownloadUrl, zipPath);
                }

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
            catch (Exception ex)
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
