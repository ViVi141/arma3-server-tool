using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class SchedulerServiceStabilityTests
    {
        [Fact]
        public async Task StartAsync_ConcurrentCalls_DoesNotThrowAndCanScheduleJobs()
        {
            var scheduler = new SchedulerService(new NoOpProcessService());
            try
            {
                Task[] starts = Enumerable.Range(0, 24)
                    .Select(_ => scheduler.StartAsync())
                    .ToArray();
                await Task.WhenAll(starts);

                string serverUuid = "stability-server";
                var crons = new Dictionary<string, CronEntity>(StringComparer.Ordinal)
                {
                    {
                        "task-a",
                        new CronEntity
                        {
                            TaskId = "task-a",
                            ServerUUID = serverUuid,
                            Cron = "0 */5 * * * ?",
                            Status = 1,
                        }
                    },
                };

                Task[] syncs = Enumerable.Range(0, 8)
                    .Select(_ => scheduler.SyncJobsAsync(serverUuid, crons))
                    .ToArray();
                await Task.WhenAll(syncs);

                string summary = await scheduler.GetNextFireSummaryAsync(serverUuid);
                Assert.False(string.IsNullOrWhiteSpace(summary));
            }
            finally
            {
                await scheduler.StopAsync();
            }
        }

        [Fact]
        public async Task StopAsync_CalledRepeatedly_RemainsIdempotent()
        {
            var scheduler = new SchedulerService(new NoOpProcessService());
            await scheduler.StartAsync();

            Task[] stops = Enumerable.Range(0, 12)
                .Select(_ => scheduler.StopAsync())
                .ToArray();
            await Task.WhenAll(stops);

            await scheduler.StopAsync();
        }

        private sealed class NoOpProcessService : IServerProcessService
        {
            public OperationResult Start(string serverUuid) => OperationResult.Ok();

            public OperationResult Start(ArmaServerConfig config) => OperationResult.Ok();

            public OperationResult Stop(string serverUuid) => OperationResult.Ok();

            public OperationResult Stop(ArmaServerConfig config) => OperationResult.Ok();

            public ServerRunState GetState(string serverUuid) => ServerRunState.Stopped;

            public ServerRunState GetState(ArmaServerConfig config) => ServerRunState.Stopped;

            public ServerRunState SyncState(string serverUuid) => ServerRunState.Stopped;

            public ServerRunState SyncState(ArmaServerConfig config) => ServerRunState.Stopped;

            public ServerRunState PeekState(ArmaServerConfig config) => ServerRunState.Stopped;

            public OperationResult StartHeadlessClient(string serverUuid) => OperationResult.Ok();

            public OperationResult DetectRestart(string serverUuid) => OperationResult.Ok();
        }
    }
}
