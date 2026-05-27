using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Automation
{
    public interface IServerAutomationService
    {
        IReadOnlyList<ServerListItem> ListServers();

        ServerAutomationStatus GetStatus(string serverUuid);

        ArmaServerConfig ResolveServer(string serverUuid, string serverName);

        Task<AutomationRunResult> ExecuteTaskAsync(
            AutomationTaskDocument task,
            CancellationToken cancellationToken);

        string EnqueueTask(AutomationTaskDocument task);

        AutomationTaskRunState GetTaskRun(string taskId);

        Task<AutomationRunResult> ExecuteTaskFileAsync(
            string filePath,
            CancellationToken cancellationToken);

        OperationResult StopServer(string serverUuid);

        OperationResult StartServer(string serverUuid);

        OperationResult RestartServer(string serverUuid);

        OperationResult WriteConfigFiles(string serverUuid);

        OperationResult SwitchMission(string serverUuid, string missionTemplate, int difficulty, bool restart);

        OperationResult DownloadWorkshopMods(string serverUuid, IList<ulong> modIds, bool enableOnServer);

        OperationResult DownloadWorkshopMods(
            string serverUuid,
            IList<ulong> modIds,
            bool enableOnServer,
            bool captureSteamCmdOutput,
            int steamCmdTimeoutSeconds);

        OperationResult UpdateDedicatedServer(string serverUuid);

        OperationResult UpdateDedicatedServer(
            string serverUuid,
            bool captureSteamCmdOutput,
            int steamCmdTimeoutSeconds);
    }
}
