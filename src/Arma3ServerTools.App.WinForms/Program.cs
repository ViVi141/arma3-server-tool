using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
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
            System.Windows.Forms.Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            System.Windows.Forms.Application.ThreadException += OnThreadException;
            AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;

            System.Windows.Forms.Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
            System.Windows.Forms.Application.EnableVisualStyles();
            System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                RunApplication();
            }
            catch (Exception ex)
            {
                ShowFatalError(ex);
            }
        }

        private static void RunApplication()
        {
            AppPaths paths = new AppPaths(AppContext.BaseDirectory);
            if (PathValidation.ContainsChinese(paths.ApplicationBase)
                || PathValidation.ContainsChinese(paths.UserDataDirectory))
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

            using (SingleInstanceGuard singleInstance = new SingleInstanceGuard())
            {
                if (!singleInstance.IsFirstInstance)
                {
                    SingleInstanceActivator.TryActivateExistingInstance();
                    ShowSingleInstanceBlockedMessage();
                    return;
                }

                RunApplicationCore(paths);
            }
        }

        private static void RunApplicationCore(AppPaths paths)
        {
            AppLogging.Initialize(paths.LogDirectory);

            ServiceProvider serviceProvider = null;
            try
            {
                var services = new ServiceCollection();
                services.AddArma3ServerTools(paths);
                serviceProvider = services.BuildServiceProvider();

                ILogger logger = serviceProvider.GetRequiredService<ILogger>();
                logger.LogInformation(
                    "Starting {Product}. Install={InstallDirectory}, UserData={UserDataDirectory}.",
                    ToolConstants.ProductName,
                    paths.ApplicationBase,
                    paths.UserDataDirectory);

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

        private static void OnThreadException(object sender, ThreadExceptionEventArgs e)
        {
            ShowFatalError(e.Exception);
        }

        private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            if (e.ExceptionObject is Exception ex)
            {
                ShowFatalError(ex);
            }
        }

        private static void ShowSingleInstanceBlockedMessage()
        {
            string message = UiLabels.SingleInstanceAlreadyRunning;
            try
            {
                AntdUI.Modal.open("程序已在运行", message, AntdUI.TType.Warn);
            }
            catch
            {
                MessageBox.Show(message, "程序已在运行", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private static void ShowFatalError(Exception ex)
        {
            string message = "程序启动或运行失败。" + Environment.NewLine + Environment.NewLine + ex.Message;
            try
            {
                AntdUI.Modal.open("启动失败", message, AntdUI.TType.Error);
            }
            catch
            {
                MessageBox.Show(message, "启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
