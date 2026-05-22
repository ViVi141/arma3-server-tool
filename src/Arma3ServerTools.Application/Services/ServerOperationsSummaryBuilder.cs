using System;
using System.Collections.Generic;
using System.Text;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public static class ServerOperationsSummaryBuilder
    {
        public static string BuildMonitoringLine(ArmaServerConfig config)
        {
            if (config == null)
            {
                return "—";
            }

            ServerManagement management = config.ServerTaskManagement;
            string monitor;
            if (management.EnableMonitor)
            {
                monitor = "开";
            }
            else
            {
                monitor = "关";
            }

            string statistics;
            if (management.EnableMonitoringService)
            {
                statistics = "开";
            }
            else
            {
                statistics = "关";
            }

            return "监控模组 "
                + monitor
                + " · 统计入库 "
                + statistics
                + "（"
                + ToolConstants.MonitoringServerModToken
                + " / "
                + ToolConstants.StatisticsDatabaseFileName
                + "）";
        }

        public static string BuildCronLine(ArmaServerConfig config, string nextFireSummary)
        {
            if (config == null)
            {
                return "—";
            }

            int enabledCount = CountEnabledCronTasks(config.ServerTaskManagement.CronEntity);
            var builder = new StringBuilder();
            builder.Append("已启用定时任务 ");
            builder.Append(enabledCount);
            builder.Append(" 个");
            if (!string.IsNullOrWhiteSpace(nextFireSummary))
            {
                builder.Append(" · ");
                builder.Append(nextFireSummary);
            }

            if (config.ServerTaskManagement.RestartTime > 0)
            {
                builder.Append(" · 模组内重启间隔 ");
                builder.Append(config.ServerTaskManagement.RestartTime);
                builder.Append(" 小时");
            }

            return builder.ToString();
        }

        public static int CountEnabledCronTasks(IDictionary<string, CronEntity> crons)
        {
            if (crons == null || crons.Count == 0)
            {
                return 0;
            }

            int count = 0;
            foreach (KeyValuePair<string, CronEntity> pair in crons)
            {
                CronEntity cron = pair.Value;
                if (cron != null && cron.Status == 1 && !string.IsNullOrWhiteSpace(cron.Cron))
                {
                    count++;
                }
            }

            return count;
        }
    }
}
