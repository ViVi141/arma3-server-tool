using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Forms;

namespace Arma3ServerTools.App.WinForms
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            if (ContainsChineseInPath(AppContext.BaseDirectory))
            {
                AntdUI.Modal.open(
                    "失败",
                    "你当前的开服工具路径里包含中文，这会导致一系列问题，请确保安装路径里不包含中文!",
                    AntdUI.TType.Error);
                Process.GetCurrentProcess().Kill();
                return;
            }

            System.Windows.Forms.Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
            System.Windows.Forms.Application.EnableVisualStyles();
            System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);
            AppTheme.Initialize();
            AntdUiBootstrap.Initialize();
            System.Windows.Forms.Application.Run(new MainForm());
        }

        private static bool ContainsChineseInPath(string path)
        {
            if (string.IsNullOrEmpty(path))
            {
                return false;
            }

            return Regex.IsMatch(path, @"[\u4e00-\u9fa5]");
        }
    }
}
