using System.Collections.Generic;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Scheduling;
using Arma3ServerTools.Core.Models;
using Quartz;
using Quartz.Impl;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SchedulerService : ISchedulerService
    {
        private readonly IServerProcessService processService;
        private IScheduler scheduler;

        public SchedulerService(IServerProcessService processService)
        {
            this.processService = processService;
        }

        public async Task StartAsync()
        {
            if (scheduler != null)
            {
                return;
            }

            ISchedulerFactory factory = new StdSchedulerFactory();
            scheduler = await factory.GetScheduler().ConfigureAwait(false);
            await scheduler.Start().ConfigureAwait(false);
        }

        public async Task StopAsync()
        {
            if (scheduler == null)
            {
                return;
            }

            await scheduler.Shutdown(false).ConfigureAwait(false);
            scheduler = null;
        }

        public async Task SyncJobsAsync(string serverUuid, IDictionary<string, CronEntity> crons)
        {
            await StartAsync().ConfigureAwait(false);

            var existingKeys = await scheduler.GetJobKeys(Quartz.Impl.Matchers.GroupMatcher<JobKey>.GroupEquals(serverUuid))
                .ConfigureAwait(false);
            foreach (JobKey jobKey in existingKeys)
            {
                await scheduler.DeleteJob(jobKey).ConfigureAwait(false);
            }

            if (crons == null)
            {
                return;
            }

            foreach (KeyValuePair<string, CronEntity> pair in crons)
            {
                CronEntity cron = pair.Value;
                if (cron == null || cron.Status != 1 || string.IsNullOrEmpty(cron.Cron))
                {
                    continue;
                }

                var jobData = new JobDataMap
                {
                    { "Arma3Config", cron },
                    { "TaskKey", cron.TaskId },
                    { "ProcessService", processService },
                };

                IJobDetail job = JobBuilder.Create<ServerRestartManagementJob>()
                    .WithIdentity(cron.TaskId, serverUuid)
                    .SetJobData(jobData)
                    .Build();

                ITrigger trigger = TriggerBuilder.Create()
                    .WithIdentity(cron.TaskId + "-trigger", serverUuid)
                    .WithCronSchedule(cron.Cron)
                    .ForJob(job)
                    .Build();

                await scheduler.ScheduleJob(job, trigger).ConfigureAwait(false);
            }
        }
    }
}
