using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class ServerOperationsSummaryBuilderTests
    {
        [Fact]
        public void BuildMonitoringLine_ReflectsToggleStates()
        {
            var config = new ArmaServerConfig
            {
                ServerTaskManagement = new ServerManagement
                {
                    EnableMonitor = true,
                    EnableMonitoringService = false,
                },
            };

            string line = ServerOperationsSummaryBuilder.BuildMonitoringLine(config);

            Assert.Contains("监控模组 开", line);
            Assert.Contains("统计入库 关", line);
        }

        [Fact]
        public void BuildCronLine_IncludesEnabledCountAndRestartTime()
        {
            var config = new ArmaServerConfig
            {
                ServerTaskManagement = new ServerManagement
                {
                    RestartTime = 6,
                    CronEntity =
                    {
                        ["a"] = new CronEntity { Status = 1, Cron = "0 0 4 * * ?" },
                        ["b"] = new CronEntity { Status = 0, Cron = "0 0 5 * * ?" },
                    },
                },
            };

            string line = ServerOperationsSummaryBuilder.BuildCronLine(config, "下次调度 2026-05-24 04:00");

            Assert.Contains("已启用定时任务 1 个", line);
            Assert.Contains("下次调度 2026-05-24 04:00", line);
            Assert.Contains("模组内重启间隔 6 小时", line);
        }
    }
}
