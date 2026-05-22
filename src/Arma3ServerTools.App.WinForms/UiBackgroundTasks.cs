using System;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.App.WinForms
{
    internal static class UiBackgroundTasks
    {
        private static readonly TimeSpan SchedulerShutdownTimeout = TimeSpan.FromSeconds(5);
        private static readonly ILogger Logger = AppLogging.CreateLogger("UiBackgroundTasks");

        public static void WarmScheduler(ISchedulerService schedulerService)
        {
            Task.Run(async () =>
            {
                try
                {
                    await schedulerService.StartAsync().ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    Logger.LogWarning(ex, "Background scheduler warm-up failed.");
                }
            });
        }

        public static void WarmSteamCmdResolution(ISteamCmdService steamCmdService)
        {
            Task.Run(async () =>
            {
                try
                {
                    await steamCmdService
                        .EnsureSteamCmdAvailableAsync(false, CancellationToken.None)
                        .ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    Logger.LogWarning(ex, "Background SteamCMD resolution failed.");
                }
            });
        }

        public static void ShutdownScheduler(ISchedulerService schedulerService)
        {
            try
            {
                Task shutdownTask = Task.Run(async () =>
                {
                    await schedulerService.StopAsync().ConfigureAwait(false);
                });
                shutdownTask.Wait(SchedulerShutdownTimeout);
            }
            catch (Exception ex)
            {
                Logger.LogWarning(ex, "Scheduler shutdown did not complete cleanly.");
            }
        }

        public static void SyncSchedulerJobs(
            ISchedulerService schedulerService,
            ArmaServerConfig config,
            Action<string> reportWarning)
        {
            if (config == null || string.IsNullOrEmpty(config.ServerUUID))
            {
                return;
            }

            string serverUuid = config.ServerUUID;
            System.Collections.Generic.IDictionary<string, CronEntity> crons =
                config.ServerTaskManagement.CronEntity;
            Task.Run(async () =>
            {
                try
                {
                    await schedulerService.SyncJobsAsync(serverUuid, crons).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    Logger.LogWarning(ex, "Scheduler sync failed for server {ServerUuid}.", serverUuid);
                    if (reportWarning != null)
                    {
                        reportWarning(ex.Message);
                    }
                }
            });
        }
    }
}
