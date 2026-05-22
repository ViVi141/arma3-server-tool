using System;
using System.Runtime.InteropServices;
using System.Text;

namespace Arma3ServerTools.Core.Window
{
    public static class CopyDataMessenger
    {
        private const int WmCopyData = 0x004A;

        [DllImport("User32.dll", EntryPoint = "SendMessage", CharSet = CharSet.Ansi)]
        private static extern IntPtr SendMessageIntPtr(
            IntPtr hWnd,
            int msg,
            IntPtr wParam,
            ref CopyDataStruct lParam);

        [DllImport("User32.dll", EntryPoint = "SendMessage", CharSet = CharSet.Ansi)]
        private static extern int SendMessageInt(
            int hWnd,
            int msg,
            int wParam,
            ref CopyDataStruct lParam);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        public struct CopyDataStruct
        {
            public IntPtr DwData;
            public int CbData;
            public string LpData;
        }

        public static bool Send(IntPtr windowHandle, string message)
        {
            if (windowHandle == IntPtr.Zero || string.IsNullOrEmpty(message))
            {
                return false;
            }

            byte[] payload = Encoding.Default.GetBytes(message);
            var data = new CopyDataStruct
            {
                DwData = (IntPtr)100,
                LpData = message,
                CbData = payload.Length + 1,
            };

            SendMessageIntPtr(windowHandle, WmCopyData, IntPtr.Zero, ref data);
            return true;
        }

        public static bool Send(int windowHandle, string message)
        {
            if (windowHandle == 0 || string.IsNullOrEmpty(message))
            {
                return false;
            }

            byte[] payload = Encoding.Default.GetBytes(message);
            var data = new CopyDataStruct
            {
                DwData = (IntPtr)100,
                LpData = message,
                CbData = payload.Length + 1,
            };

            SendMessageInt(windowHandle, WmCopyData, 0, ref data);
            return true;
        }
    }
}
