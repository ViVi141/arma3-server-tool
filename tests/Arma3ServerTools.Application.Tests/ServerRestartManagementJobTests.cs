using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Scheduling;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Quartz;
using Quartz.Impl;
using Quartz.Impl.Triggers;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class ServerRestartManagementJobTests
    {
        [Theory]
        [InlineData(0, new[] { "Stop:uuid-1", "Start:uuid-1" })]
        [InlineData(1, new[] { "Start:uuid-1" })]
        [InlineData(2, new[] { "Stop:uuid-1" })]
        [InlineData(3, new[] { "DetectRestart:uuid-1" })]
        public async Task Execute_RunsExpectedProcessAction(int action, string[] expectedActions)
        {
            var processService = new RecordingProcessService();
            var cron = new CronEntity
            {
                TaskId = "task-1",
                ServerUUID = "uuid-1",
                Status = 1,
                Action = action,
            };

            var job = new ServerRestartManagementJob();
            await job.Execute(CreateContext(cron, processService)).ConfigureAwait(true);

            Assert.Equal(expectedActions, processService.Actions);
        }

        [Fact]
        public async Task Execute_DisabledCron_DoesNothing()
        {
            var processService = new RecordingProcessService();
            var cron = new CronEntity
            {
                ServerUUID = "uuid-1",
                Status = 0,
                Action = 1,
            };

            var job = new ServerRestartManagementJob();
            await job.Execute(CreateContext(cron, processService)).ConfigureAwait(true);

            Assert.Empty(processService.Actions);
        }

        [Fact]
        public async Task Execute_MissingProcessService_DoesNothing()
        {
            var cron = new CronEntity
            {
                ServerUUID = "uuid-1",
                Status = 1,
                Action = 1,
            };

            IJobDetail jobDetail = JobBuilder.Create<ServerRestartManagementJob>()
                .WithIdentity("missing-service")
                .UsingJobData(new JobDataMap { { "Arma3Config", cron } })
                .Build();

            var job = new ServerRestartManagementJob();
            await job.Execute(new FakeJobExecutionContext(jobDetail)).ConfigureAwait(true);
        }

        private static IJobExecutionContext CreateContext(CronEntity cron, IServerProcessService processService)
        {
            var jobData = new JobDataMap();
            jobData.Put("Arma3Config", cron);
            jobData.Put("ProcessService", processService);

            IJobDetail jobDetail = JobBuilder.Create<ServerRestartManagementJob>()
                .WithIdentity("cron-test")
                .UsingJobData(jobData)
                .Build();
            return new FakeJobExecutionContext(jobDetail);
        }
    }

    internal sealed class RecordingProcessService : IServerProcessService
    {
        public List<string> Actions { get; } = new List<string>();

        public OperationResult Start(string serverUuid)
        {
            Actions.Add("Start:" + serverUuid);
            return OperationResult.Ok();
        }

        public OperationResult Stop(string serverUuid)
        {
            Actions.Add("Stop:" + serverUuid);
            return OperationResult.Ok();
        }

        public ServerRunState GetState(string serverUuid)
        {
            return ServerRunState.Stopped;
        }

        public ServerRunState SyncState(string serverUuid)
        {
            return ServerRunState.Stopped;
        }

        public OperationResult StartHeadlessClient(string serverUuid)
        {
            Actions.Add("StartHeadlessClient:" + serverUuid);
            return OperationResult.Ok();
        }

        public OperationResult DetectRestart(string serverUuid)
        {
            Actions.Add("DetectRestart:" + serverUuid);
            return OperationResult.Ok();
        }
    }

    internal sealed class FakeJobExecutionContext : IJobExecutionContext
    {
        public FakeJobExecutionContext(IJobDetail jobDetail)
        {
            JobDetail = jobDetail;
            MergedJobDataMap = jobDetail.JobDataMap;
        }

        public IJobDetail JobDetail { get; }

        public JobDataMap MergedJobDataMap { get; }

        public ITrigger Trigger { get; } = new SimpleTriggerImpl("test-trigger");

        public ICalendar Calendar => null;

        public bool Recovering => false;

        public TriggerKey RecoveringTriggerKey => null;

        public int RefireCount => 0;

        public JobDataMap TriggerJobDataMap { get; } = new JobDataMap();

        public IJob JobInstance => null;

        public DateTimeOffset FireTimeUtc => DateTimeOffset.UtcNow;

        public DateTimeOffset? ScheduledFireTimeUtc => FireTimeUtc;

        public DateTimeOffset? PreviousFireTimeUtc => null;

        public DateTimeOffset? NextFireTimeUtc => null;

        public string FireInstanceId => "test-fire";

        public object Result { get; set; }

        public TimeSpan JobRunTime => TimeSpan.Zero;

        public CancellationToken CancellationToken => CancellationToken.None;

        public object Get(object key)
        {
            return MergedJobDataMap.Get(key.ToString());
        }

        public void Put(object key, object value)
        {
            MergedJobDataMap.Put(key.ToString(), value);
        }

        public IScheduler Scheduler => null;
    }
}
