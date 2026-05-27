using System;
using System.IO;
using System.Text;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;

namespace Arma3ServerTools.App.WinForms
{
    /// <summary>
    /// User-visible labels and hints for SteamCMD / Workshop / dedicated server directories.
    /// </summary>
    internal static class SteamPathUiHelper
    {
        public const string ProgramDirectoryLabel = "SteamCMD 程序目录";

        public const string WorkshopModDirectoryLabel = "模组下载目录（只读）";

        public const string DedicatedServerDirectoryLabel = "专用服务器游戏目录";

        public const string SteamCmdStatusLabel = "SteamCMD 位置";

        public const string PathsHint =
            "① SteamCMD 程序目录：含 steamcmd.exe 的文件夹；下载 Workshop 模组时在其下生成 "
            + @"steamapps\workshop\content\107410\<模组ID>\。"
            + " 留空则使用下方「工具内置」目录。"
            + " ② 专用服务器游戏目录：arma3server、任务与 cfg 等，与模组目录不是同一文件夹。"
            + " ③ 点「下载 SteamCMD」默认安装到工具内置目录（extension）。";

        public const string WorkshopModPathPending = "（请先填写 SteamCMD 程序目录，或留空使用工具内置目录）";

        public static string GetWorkshopModContentPath(string programDirectory)
        {
            if (string.IsNullOrWhiteSpace(programDirectory))
            {
                return string.Empty;
            }

            return Path.Combine(
                programDirectory.Trim(),
                ModEnablerService.WorkshopContentRelativePath);
        }

        public static string FormatWorkshopModDirectoryLabel(string programDirectory)
        {
            string contentPath = GetWorkshopModContentPath(programDirectory);
            if (string.IsNullOrEmpty(contentPath))
            {
                return WorkshopModPathPending;
            }

            if (Directory.Exists(contentPath))
            {
                return contentPath + Environment.NewLine
                    + "（模组 .pbo 在此；保存设置后会加入「模组」页扫描路径）";
            }

            return contentPath + Environment.NewLine
                + "（下载模组后自动创建；保存设置后会加入扫描路径）";
        }

        public static string FormatSteamCmdLocationStatus(IAppPaths paths, string programDirectory)
        {
            string bundledDirectory = SteamCmdBootstrapper.GetBundledDirectory(paths);
            string bundledExe = SteamCmdBootstrapper.GetBundledExecutablePath(paths);
            bool bundledReady = SteamCmdBootstrapper.IsInstallationComplete(bundledDirectory);

            var status = new StringBuilder();
            status.AppendLine("工具内置（推荐，点「下载 SteamCMD」装到这里）：");
            status.AppendLine("  " + bundledExe);
            if (bundledReady)
            {
                status.AppendLine("  → 已安装");
            }
            else
            {
                status.AppendLine("  → 未安装");
            }

            string trimmedProgramDirectory = programDirectory != null ? programDirectory.Trim() : string.Empty;
            if (!string.IsNullOrEmpty(trimmedProgramDirectory))
            {
                string customExe = Path.Combine(trimmedProgramDirectory, "steamcmd.exe");
                bool customReady = File.Exists(customExe);
                status.AppendLine();
                status.AppendLine("上方填写的 SteamCMD 程序目录：");
                status.AppendLine("  " + customExe);
                if (customReady)
                {
                    status.AppendLine("  → 已找到 steamcmd.exe");
                }
                else
                {
                    status.AppendLine("  → 未找到 steamcmd.exe（请选含 steamcmd.exe 的文件夹）");
                }

                if (string.Equals(
                    Path.GetFullPath(trimmedProgramDirectory),
                    Path.GetFullPath(bundledDirectory),
                    StringComparison.OrdinalIgnoreCase))
                {
                    status.AppendLine("  （与工具内置目录相同）");
                }
            }
            else
            {
                status.AppendLine();
                status.AppendLine("未填写程序目录 → 下载模组 / 装服时使用「工具内置」路径。");
            }

            return status.ToString().TrimEnd();
        }
    }
}
