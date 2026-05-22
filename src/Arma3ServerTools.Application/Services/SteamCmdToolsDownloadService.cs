using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Window;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdToolsDownloadService
    {
        public const string ToolsWindowTitle = "A3DestinySteamTools";
        private const int Arma3WorkshopAppId = 107410;
        private const int WindowWaitAttempts = 50;
        private const int WindowWaitDelayMs = 200;

        private readonly IAppPaths paths;

        public SteamCmdToolsDownloadService(IAppPaths paths)
        {
            this.paths = paths;
        }

        public string GetToolsDirectory()
        {
            return Path.Combine(paths.ApplicationBase, "steamcmdTools");
        }

        public string GetToolsExecutablePath()
        {
            return Path.Combine(GetToolsDirectory(), "steamcmdTools.exe");
        }

        public bool IsToolsAvailable()
        {
            return File.Exists(GetToolsExecutablePath());
        }

        public OperationResult DownloadMods(string workshopRoot, string user, string password, IEnumerable<ulong> modIds)
        {
            if (string.IsNullOrWhiteSpace(workshopRoot))
            {
                return OperationResult.Fail("SteamCMD Workshop 根目录未配置。");
            }

            if (string.IsNullOrWhiteSpace(user))
            {
                return OperationResult.Fail("SteamCMD 账号未配置。");
            }

            string executablePath = GetToolsExecutablePath();
            if (!File.Exists(executablePath))
            {
                return OperationResult.Fail(
                    "找不到 steamcmdTools.exe。" + Environment.NewLine
                    + "应位于: " + executablePath + Environment.NewLine
                    + "请重新编译解决方案以复制 steamcmdTools 组件。");
            }

            var ids = new List<ulong>();
            foreach (ulong modId in modIds)
            {
                if (modId > 0)
                {
                    ids.Add(modId);
                }
            }

            if (ids.Count == 0)
            {
                return OperationResult.Fail("没有有效的 Workshop 模组 ID。");
            }

            Process process = null;
            try
            {
                process = Process.Start(new ProcessStartInfo
                {
                    FileName = executablePath,
                    WorkingDirectory = GetToolsDirectory(),
                    UseShellExecute = true,
                });
            }
            catch (Exception ex)
            {
                return OperationResult.Fail("无法启动 steamcmdTools.exe: " + ex.Message);
            }

            if (process == null)
            {
                return OperationResult.Fail("无法启动 steamcmdTools.exe。");
            }

            IntPtr windowHandle = WaitForToolsWindow(process);
            if (windowHandle == IntPtr.Zero)
            {
                return OperationResult.Fail("steamcmdTools 窗口未就绪，无法发送下载命令。");
            }

            Thread.Sleep(500);
            SendInitCommands(windowHandle, workshopRoot, user, password, ids);
            return OperationResult.Ok("已启动 steamcmdTools 下载 " + ids.Count + " 个模组。");
        }

        internal static void SendInitCommands(
            IntPtr windowHandle,
            string workshopRoot,
            string user,
            string password,
            IList<ulong> modIds)
        {
            CopyDataMessenger.Send(windowHandle, "0x001" + workshopRoot);
            Thread.Sleep(300);
            CopyDataMessenger.Send(windowHandle, "0x002login " + user + " " + password);
            Thread.Sleep(300);
            for (int i = 0; i < modIds.Count; i++)
            {
                CopyDataMessenger.Send(
                    windowHandle,
                    "0x002workshop_download_item " + Arma3WorkshopAppId + " " + modIds[i]);
                Thread.Sleep(200);
            }

            CopyDataMessenger.Send(windowHandle, "0x002quit");
        }

        private static IntPtr WaitForToolsWindow(Process process)
        {
            for (int attempt = 0; attempt < WindowWaitAttempts; attempt++)
            {
                try
                {
                    process.Refresh();
                    if (process.MainWindowHandle != IntPtr.Zero)
                    {
                        return process.MainWindowHandle;
                    }
                }
                catch
                {
                }

                IntPtr handle = NativeWindowTools.FindWindowByTitleContains(ToolsWindowTitle);
                if (handle != IntPtr.Zero)
                {
                    return handle;
                }

                Thread.Sleep(WindowWaitDelayMs);
            }

            return IntPtr.Zero;
        }
    }
}
