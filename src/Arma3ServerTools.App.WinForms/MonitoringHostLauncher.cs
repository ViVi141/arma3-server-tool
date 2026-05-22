using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Core;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.App.WinForms
{
    internal static class MonitoringHostLauncher
    {
        public const string WindowTitle = ToolConstants.MonitoringHostWindowTitle;
        private const string HostExeName = "Arma3ServerTools.MonitoringHost.exe";
        private const string MonitoringFolderName = "monitoring";

        private static Process startedProcess;

        public static bool IsHostRunning()
        {
            return FindWindow(null, WindowTitle) != IntPtr.Zero;
        }

        public static bool TryStart(string applicationBase, out string message)
        {
            message = string.Empty;
            if (IsHostWindowRunning())
            {
                message = "监控宿主已在运行";
                return true;
            }

            string hostDirectory = Path.Combine(applicationBase, MonitoringFolderName);
            string hostExe = Path.Combine(hostDirectory, HostExeName);
            if (!File.Exists(hostExe))
            {
                message = "未找到 monitoring\\" + HostExeName;
                return false;
            }

            try
            {
                startedProcess = Process.Start(new ProcessStartInfo
                {
                    FileName = hostExe,
                    WorkingDirectory = hostDirectory,
                    UseShellExecute = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                });
                return true;
            }
            catch (Exception ex)
            {
                message = "启动监控宿主失败: " + ex.Message;
                return false;
            }
        }

        public static void StopStartedHost()
        {
            if (startedProcess != null && !startedProcess.HasExited)
            {
                try
                {
                    startedProcess.CloseMainWindow();
                    if (!startedProcess.WaitForExit(400))
                    {
                        startedProcess.Kill();
                    }
                }
                catch (Exception ex)
                {
                    AppLogging.CreateLogger("MonitoringHostLauncher")
                        .LogWarning(ex, "Failed to stop monitoring host process gracefully.");
                }
                finally
                {
                    startedProcess.Dispose();
                    startedProcess = null;
                }

                return;
            }

            IntPtr windowHandle = FindWindow(null, WindowTitle);
            if (windowHandle != IntPtr.Zero)
            {
                SendMessage(windowHandle, WmClose, IntPtr.Zero, IntPtr.Zero);
            }
        }

        private static bool IsHostWindowRunning()
        {
            return FindWindow(null, WindowTitle) != IntPtr.Zero;
        }

        private const int WmClose = 0x0010;

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
    }
}
