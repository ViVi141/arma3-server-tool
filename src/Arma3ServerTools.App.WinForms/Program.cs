using System;
using System.Diagnostics;
using System.IO;
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
                    UiLabels.PathRulesShort,
                    AntdUI.TType.Error);
                Process.GetCurrentProcess().Kill();
                return;
            }

            if (!DesktopRuntimeChecker.TryEnsureDesktopRuntime(null))
            {
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
