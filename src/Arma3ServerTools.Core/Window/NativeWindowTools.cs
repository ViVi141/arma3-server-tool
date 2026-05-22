using System;
using System.Runtime.InteropServices;
using System.Text;

namespace Arma3ServerTools.Core.Window
{
    public static class NativeWindowTools
    {
        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("User32.dll", EntryPoint = "FindWindow")]
        private static extern int FindWindow(string lpClassName, string lpWindowName);

        [DllImport("User32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

        [DllImport("User32.dll", CharSet = CharSet.Unicode)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        public static int FindServerWindow(string className, string windowName)
        {
            return FindWindow(className, windowName);
        }

        public static IntPtr FindWindowByTitleContains(string partialTitle)
        {
            if (string.IsNullOrEmpty(partialTitle))
            {
                return IntPtr.Zero;
            }

            IntPtr found = IntPtr.Zero;
            EnumWindows(
                delegate (IntPtr hWnd, IntPtr lParam)
                {
                    var builder = new StringBuilder(512);
                    GetWindowText(hWnd, builder, builder.Capacity);
                    if (builder.ToString().IndexOf(partialTitle, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        found = hWnd;
                        return false;
                    }

                    return true;
                },
                IntPtr.Zero);
            return found;
        }
    }
}
