using System;
using Arma3ServerTools.Application.DependencyInjection;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Microsoft.Extensions.DependencyInjection;

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

            services.AddArma3ServerToolsApplication(paths);
            services.AddSingleton<AppServices>();
            services.AddSingleton<IAppServices>(provider => provider.GetRequiredService<AppServices>());
            services.AddSingleton<ServerLifecycleCoordinator>();
            return services;
        }
    }
}
