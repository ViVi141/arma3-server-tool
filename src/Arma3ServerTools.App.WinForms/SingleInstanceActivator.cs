using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace Arma3ServerTools.App.WinForms
{
    /// <summary>
    /// 将已运行的主窗口（含托盘隐藏状态）切换到前台。
    /// </summary>
    internal static class SingleInstanceActivator
    {
        private const int SwRestore = 9;
        private const int SwShow = 5;

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        public static bool TryActivateExistingInstance()
        {
            Process current = Process.GetCurrentProcess();
            Process[] processes = Process.GetProcessesByName(current.ProcessName);
            try
            {
                for (int i = 0; i < processes.Length; i++)
                {
                    Process process = processes[i];
                    if (process.Id == current.Id)
                    {
                        continue;
                    }

                    if (TryActivateProcessWindow(process.Id))
                    {
                        return true;
                    }
                }
            }
            finally
            {
                for (int i = 0; i < processes.Length; i++)
                {
                    processes[i].Dispose();
                }
            }

            return false;
        }

        private static bool TryActivateProcessWindow(int processId)
        {
            IntPtr targetWindow = IntPtr.Zero;
            EnumWindows(
                delegate (IntPtr hWnd, IntPtr lParam)
                {
                    GetWindowThreadProcessId(hWnd, out uint windowProcessId);
                    if (windowProcessId != processId)
                    {
                        return true;
                    }

                    if (GetParent(hWnd) != IntPtr.Zero)
                    {
                        return true;
                    }

                    int textLength = GetWindowTextLength(hWnd);
                    if (textLength <= 0)
                    {
                        return true;
                    }

                    var builder = new StringBuilder(textLength + 1);
                    GetWindowText(hWnd, builder, builder.Capacity);
                    string title = builder.ToString();
                    if (!title.StartsWith(UiLabels.AppTitle, StringComparison.Ordinal))
                    {
                        return true;
                    }

                    targetWindow = hWnd;
                    return false;
                },
                IntPtr.Zero);

            if (targetWindow == IntPtr.Zero)
            {
                return false;
            }

            ShowWindow(targetWindow, SwRestore);
            ShowWindow(targetWindow, SwShow);
            SetForegroundWindow(targetWindow);
            return true;
        }

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr GetParent(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    }
}
