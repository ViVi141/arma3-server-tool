using System;
using System.Collections.Generic;
using Arma3ServerTools.Agent.Host.Configuration;
using Arma3ServerTools.Agent.Host.Http;
using Arma3ServerTools.Agent.Host.Inbox;
using Arma3ServerTools.Application.DependencyInjection;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Microsoft.AspNetCore.Builder;
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
            SteamCmdConsoleMirror.Enabled = settings.SteamCmd.MirrorOutputToConsole;

            if (!settings.Http.Enabled)
            {
                Console.WriteLine("HTTP API 已在配置中禁用。");
                return 1;
            }

            IList<string> listenUrls = AgentHttpEndpointResolver.ResolveListenPrefixes(settings.Http);
            var urlBuilder = new System.Text.StringBuilder();
            for (int i = 0; i < listenUrls.Count; i++)
            {
                if (urlBuilder.Length > 0)
                {
                    urlBuilder.Append(';');
                }

                urlBuilder.Append(listenUrls[i].TrimEnd('/'));
            }

            Environment.SetEnvironmentVariable("ASPNETCORE_URLS", urlBuilder.ToString());
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = args,
                ContentRootPath = baseDirectory,
            });

            builder.Services.AddArma3ServerToolsApplication(paths);
            builder.Services.AddSingleton(settings);
            builder.Services.AddSingleton<AutomationInboxWatcher>();
            builder.Services.AddSingleton<ILogger>(provider =>
            {
                ILoggerFactory factory = AppLogging.LoggerFactory;
                return factory.CreateLogger("Arma3ServerTools.Agent");
            });
            builder.Services.AddCors(options =>
            {
                options.AddDefaultPolicy(policy =>
                    policy.AllowAnyOrigin()
                          .AllowAnyHeader()
                          .AllowAnyMethod());
            });

            WebApplication app = builder.Build();
            app.UseCors();
            app.UseMiddleware<AgentRequestIdMiddleware>();
            app.UseMiddleware<AgentAuthMiddleware>();
            app.MapAgentApi();

            AutomationInboxWatcher inboxWatcher = app.Services.GetRequiredService<AutomationInboxWatcher>();
            ILogger logger = app.Services.GetRequiredService<ILogger>();
            inboxWatcher.Start();

            logger.LogInformation("Arma3 Server Tools Agent starting (Kestrel).");
            logger.LogInformation("Settings: {SettingsPath}", AgentSettingsLoader.GetSettingsPath(paths));
            logger.LogInformation(
                "HTTP API public URL: {PublicUrl}, remote={Remote}",
                AgentHttpEndpointResolver.ResolvePublicBaseUrl(settings.Http),
                settings.Http.RemoteAccessEnabled);

            Console.WriteLine("Agent 已启动（Kestrel）。IM 请走 OpenClaw。按 Ctrl+C 退出。");
            if (settings.SteamCmd.MirrorOutputToConsole)
            {
                Console.WriteLine(
                    "SteamCMD：捕获任务会将进度输出到本窗口（settings.json → steamCmd.mirrorOutputToConsole）。"
                    + " 需要独立黑窗请任务设 captureSteamCmdOutput:false。");
            }
            app.Run();
            return 0;
        }
    }
}
