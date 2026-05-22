using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Arma3ServerTools.App.WinForms.DependencyInjection;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Validation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

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

            string applicationBase = AppContext.BaseDirectory;
            AppLogging.Initialize(Path.Combine(applicationBase, "logs"));

            ServiceProvider serviceProvider = null;
            try
            {
                var services = new ServiceCollection();
                services.AddArma3ServerTools(applicationBase);
                serviceProvider = services.BuildServiceProvider();

                ILogger logger = serviceProvider.GetRequiredService<ILogger>();
                logger.LogInformation("Starting {Product} from {BaseDirectory}.", ToolConstants.ProductName, applicationBase);

                System.Windows.Forms.Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
                System.Windows.Forms.Application.EnableVisualStyles();
                System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);
                AppTheme.Initialize();
                AntdUiBootstrap.Initialize();

                IAppServices appServices = serviceProvider.GetRequiredService<IAppServices>();
                ServerLifecycleCoordinator lifecycleCoordinator =
                    serviceProvider.GetRequiredService<ServerLifecycleCoordinator>();
                System.Windows.Forms.Application.Run(new MainForm(appServices, lifecycleCoordinator));
            }
            finally
            {
                if (serviceProvider != null)
                {
                    serviceProvider.Dispose();
                }

                AppLogging.Shutdown();
            }
        }
    }
}
