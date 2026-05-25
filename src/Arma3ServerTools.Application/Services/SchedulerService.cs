using System;
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
        private readonly object schedulerLock = new object();
        private IScheduler scheduler;
        private Task startTask;

        public SchedulerService(IServerProcessService processService)
        {
            this.processService = processService;
        }

        public Task StartAsync()
        {
            lock (schedulerLock)
            {
                if (scheduler != null)
                {
                    return Task.CompletedTask;
                }

                if (startTask != null)
                {
                    return startTask;
                }

                startTask = StartSchedulerCoreAsync();
                return startTask;
            }
        }

        private async Task StartSchedulerCoreAsync()
        {
            ISchedulerFactory factory = new StdSchedulerFactory();
            IScheduler created = await factory.GetScheduler().ConfigureAwait(false);
            await created.Start().ConfigureAwait(false);

            lock (schedulerLock)
            {
                scheduler = created;
            }
        }

        public async Task StopAsync()
        {
            IScheduler toShutdown;
            lock (schedulerLock)
            {
                toShutdown = scheduler;
                scheduler = null;
                startTask = null;
            }

            if (toShutdown == null)
            {
                return;
            }

            await toShutdown.Shutdown(false).ConfigureAwait(false);
        }

        public async Task SyncJobsAsync(string serverUuid, IDictionary<string, CronEntity> crons)
        {
            await StartAsync().ConfigureAwait(false);

            IScheduler activeScheduler;
            lock (schedulerLock)
            {
                activeScheduler = scheduler;
            }

            if (activeScheduler == null)
            {
                return;
            }

            var existingKeys = await activeScheduler.GetJobKeys(Quartz.Impl.Matchers.GroupMatcher<JobKey>.GroupEquals(serverUuid))
                .ConfigureAwait(false);
            foreach (JobKey jobKey in existingKeys)
            {
                await activeScheduler.DeleteJob(jobKey).ConfigureAwait(false);
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

                await activeScheduler.ScheduleJob(job, trigger).ConfigureAwait(false);
            }
        }

        public async Task<string> GetNextFireSummaryAsync(string serverUuid)
        {
            await StartAsync().ConfigureAwait(false);

            IScheduler activeScheduler;
            lock (schedulerLock)
            {
                activeScheduler = scheduler;
            }

            if (activeScheduler == null)
            {
                return string.Empty;
            }

            var triggerKeys = await activeScheduler
                .GetTriggerKeys(Quartz.Impl.Matchers.GroupMatcher<TriggerKey>.GroupEquals(serverUuid))
                .ConfigureAwait(false);
            if (triggerKeys == null || triggerKeys.Count == 0)
            {
                return string.Empty;
            }

            DateTimeOffset? earliest = null;
            foreach (TriggerKey triggerKey in triggerKeys)
            {
                ITrigger trigger = await activeScheduler.GetTrigger(triggerKey).ConfigureAwait(false);
                if (trigger == null)
                {
                    continue;
                }

                DateTimeOffset? next = trigger.GetNextFireTimeUtc();
                if (!next.HasValue)
                {
                    continue;
                }

                if (!earliest.HasValue || next.Value < earliest.Value)
                {
                    earliest = next;
                }
            }

            if (!earliest.HasValue)
            {
                return string.Empty;
            }

            return "下次调度 "
                + earliest.Value.ToLocalTime().ToString("yyyy-MM-dd HH:mm");
        }
    }
}
