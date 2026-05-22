using System.Threading.Tasks;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;
using Quartz;

namespace Arma3ServerTools.Application.Scheduling
{
    public sealed class ServerRestartManagementJob : IJob
    {
        public Task Execute(IJobExecutionContext context)
        {
            var cron = (CronEntity)context.JobDetail.JobDataMap.Get("Arma3Config");
            var processService = (IServerProcessService)context.JobDetail.JobDataMap.Get("ProcessService");
            if (cron == null || processService == null || cron.Status != 1)
            {
                return Task.CompletedTask;
            }

            switch (cron.Action)
            {
                case 0:
                    processService.Stop(cron.ServerUUID);
                    processService.Start(cron.ServerUUID);
                    break;
                case 1:
                    processService.Start(cron.ServerUUID);
                    break;
                case 2:
                    processService.Stop(cron.ServerUUID);
                    break;
                case 3:
                    processService.DetectRestart(cron.ServerUUID);
                    break;
            }

            return Task.CompletedTask;
        }
    }
}
