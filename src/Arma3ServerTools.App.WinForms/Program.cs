using System;
using System.Diagnostics;
using System.Windows.Forms;
using Arma3ServerTools.Core.Validation;

namespace Arma3ServerTools.App.WinForms
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            if (PathValidation.ContainsChinese(AppContext.BaseDirectory))
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
    }
}
