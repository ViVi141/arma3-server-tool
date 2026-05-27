using System.Threading.Tasks;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;
using Microsoft.Extensions.Logging;
using Quartz;

namespace Arma3ServerTools.Application.Scheduling
{
    public sealed class ServerRestartManagementJob : IJob
    {
        private static readonly ILogger Logger = AppLogging.CreateLogger("ServerRestartManagementJob");

        public Task Execute(IJobExecutionContext context)
        {
            CronEntity cron = (CronEntity)context.JobDetail.JobDataMap.Get("Arma3Config");
            IServerProcessService processService = (IServerProcessService)context.JobDetail.JobDataMap.Get("ProcessService");
            if (cron == null || processService == null || cron.Status != 1)
            {
                return Task.CompletedTask;
            }

            try
            {
                switch (cron.Action)
                {
                    case 0:
                        ExecuteAndLog(processService.Stop(cron.ServerUUID), cron, "Stop");
                        ExecuteAndLog(processService.Start(cron.ServerUUID), cron, "Start");
                        break;
                    case 1:
                        ExecuteAndLog(processService.Start(cron.ServerUUID), cron, "Start");
                        break;
                    case 2:
                        ExecuteAndLog(processService.Stop(cron.ServerUUID), cron, "Stop");
                        break;
                    case 3:
                        ExecuteAndLog(processService.DetectRestart(cron.ServerUUID), cron, "DetectRestart");
                        break;
                    default:
                        Logger.LogWarning("Unknown cron action: {Action}, taskId={TaskId}, serverUuid={ServerUuid}", cron.Action, cron.TaskId, cron.ServerUUID);
                        break;
                }
            }
            catch (System.Exception ex)
            {
                Logger.LogError(ex, "Execute cron job failed, taskId={TaskId}, action={Action}, serverUuid={ServerUuid}", cron.TaskId, cron.Action, cron.ServerUUID);
            }

            return Task.CompletedTask;
        }

        private static void ExecuteAndLog(Arma3ServerTools.Core.OperationResult result, CronEntity cron, string actionName)
        {
            if (!result.Success)
            {
                Logger.LogWarning(
                    "Cron action failed: {Action}, taskId={TaskId}, serverUuid={ServerUuid}, message={Message}",
                    actionName,
                    cron.TaskId,
                    cron.ServerUUID,
                    result.Message);
            }
        }
    }
}
