using System;
using System.Threading;
using Arma3ServerTools.Agent.Host.Configuration;
using Arma3ServerTools.Agent.Host.Http;
using Arma3ServerTools.Agent.Host.Inbox;
using Arma3ServerTools.Application.DependencyInjection;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.Agent.Host
{
    internal static class Program
    {
        private static int Main(string[] args)
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            string baseDirectory = AppContext.BaseDirectory;
            var paths = new AppPaths(baseDirectory);
            AgentSettings settings = AgentSettingsLoader.LoadOrCreate(paths);

            var services = new ServiceCollection();
            services.AddArma3ServerToolsApplication(paths);
            services.AddSingleton(settings);
            services.AddSingleton<LocalAutomationHttpServer>();
            services.AddSingleton<AutomationInboxWatcher>();
            services.AddSingleton<ILogger>(provider =>
            {
                ILoggerFactory factory = AppLogging.LoggerFactory;
                return factory.CreateLogger("Arma3ServerTools.Agent");
            });

            ServiceProvider provider = services.BuildServiceProvider();
            LocalAutomationHttpServer httpServer = provider.GetRequiredService<LocalAutomationHttpServer>();
            AutomationInboxWatcher inboxWatcher = provider.GetRequiredService<AutomationInboxWatcher>();
            ILogger logger = provider.GetRequiredService<ILogger>();

            logger.LogInformation("Arma3 Server Tools Agent starting (local API only).");
            logger.LogInformation("Settings: {SettingsPath}", AgentSettingsLoader.GetSettingsPath(paths));
            if (settings.Http.Enabled)
            {
                logger.LogInformation(
                    "HTTP API public URL: {PublicUrl}, remote={Remote} — see docs/deployment-ab-openclaw.md",
                    AgentHttpEndpointResolver.ResolvePublicBaseUrl(settings.Http),
                    settings.Http.RemoteAccessEnabled);
            }

            httpServer.Start();
            inboxWatcher.Start();

            Console.WriteLine("Agent 已启动（仅本地 API）。IM 请走 OpenClaw。按 Ctrl+C 退出。");
            var exitEvent = new ManualResetEvent(false);
            Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e)
            {
                e.Cancel = true;
                exitEvent.Set();
            };

            exitEvent.WaitOne();
            httpServer.Dispose();
            inboxWatcher.Dispose();
            provider.Dispose();
            logger.LogInformation("Agent stopped.");
            return 0;
        }
    }
}
