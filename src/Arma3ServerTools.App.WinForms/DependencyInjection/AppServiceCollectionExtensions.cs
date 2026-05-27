using System;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.ProcessManagement;
using Arma3ServerTools.Application.Repositories;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.App.WinForms.DependencyInjection
{
    internal static class AppServiceCollectionExtensions
    {
        public static IServiceCollection AddArma3ServerTools(this IServiceCollection services, IAppPaths paths)
        {
            if (services == null)
            {
                throw new ArgumentNullException(nameof(services));
            }

            if (paths == null)
            {
                throw new ArgumentNullException(nameof(paths));
            }

            services.AddSingleton<IAppPaths>(paths);
            services.AddSingleton<ServerConfigRepository>();
            services.AddSingleton<SteamCmdConfigRepository>();
            services.AddSingleton<ModuleScanPathRepository>();
            services.AddSingleton<PlayerDatabaseRepository>();
            services.AddSingleton<ISteamCmdConfigProvider, SteamCmdConfigProvider>();
            services.AddSingleton<IServerConfigService, ServerConfigService>();
            services.AddSingleton<IGameConfigWriter, GameConfigWriterAdapter>();
            services.AddSingleton<IProcessRunner, SystemProcessRunner>();
            services.AddSingleton<MonitoringDeploymentService>();
            services.AddSingleton<IServerProcessService, ServerProcessService>();
            services.AddSingleton<ISchedulerService, SchedulerService>();
            services.AddSingleton<ISteamCmdService, SteamCmdService>();
            services.AddSingleton<BikeyService>();
            services.AddSingleton<ModScannerService>(provider => new ModScannerService(
                provider.GetRequiredService<ModuleScanPathRepository>(),
                provider.GetRequiredService<BikeyService>()));
            services.AddSingleton<BansService>();
            services.AddSingleton<MonitoringHealthChecker>();
            services.AddSingleton<ServerPreflightChecker>();
            services.AddSingleton<RptLogService>();
            services.AddSingleton<MonitoringDatabase>();
            services.AddSingleton<MonitoringQueryService>();
            services.AddSingleton<PlayerDirectoryService>();
            services.AddSingleton<IRconService, RconService>();
            services.AddSingleton<RconQuickProbe>();
            services.AddSingleton<AppServices>();
            services.AddSingleton<IAppServices>(provider => provider.GetRequiredService<AppServices>());
            services.AddSingleton<ServerLifecycleCoordinator>();

            services.AddSingleton<ILogger>(provider =>
            {
                ILoggerFactory factory = AppLogging.LoggerFactory;
                return factory.CreateLogger("Arma3ServerTools");
            });

            return services;
        }
    }
}
