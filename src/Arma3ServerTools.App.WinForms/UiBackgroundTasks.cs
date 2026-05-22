using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.App.WinForms
{
    internal static class UiBackgroundTasks
    {
        public static void WarmScheduler(ISchedulerService schedulerService)
        {
            Task.Run(async () =>
            {
                try
                {
                    await schedulerService.StartAsync().ConfigureAwait(false);
                }
                catch
                {
                }
            });
        }

        public static void WarmSteamCmdResolution(ISteamCmdService steamCmdService)
        {
            Task.Run(() =>
            {
                try
                {
                    steamCmdService.EnsureSteamCmdAvailable(false);
                }
                catch
                {
                }
            });
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
            IDictionary<string, CronEntity> crons = config.ServerTaskManagement.CronEntity;
            Task.Run(async () =>
            {
                try
                {
                    await schedulerService.SyncJobsAsync(serverUuid, crons).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    if (reportWarning != null)
                    {
                        reportWarning(ex.Message);
                    }
                }
            });
        }
    }
}
