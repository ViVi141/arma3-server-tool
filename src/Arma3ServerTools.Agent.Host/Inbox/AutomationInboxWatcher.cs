using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Agent.Host.Configuration;
using Arma3ServerTools.Application.Automation;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.Agent.Host.Inbox
{
    public sealed class AutomationInboxWatcher : IDisposable
    {
        private readonly IAppPaths paths;
        private readonly AgentSettings settings;
        private readonly IServerAutomationService automationService;
        private readonly MissionFileDeployService missionDeployService;
        private readonly ModListHtmlImportService modListHtmlImportService;
        private readonly ILogger logger;
        private Timer timer;
        private int scanInProgress;

        public AutomationInboxWatcher(
            IAppPaths paths,
            AgentSettings settings,
            IServerAutomationService automationService,
            MissionFileDeployService missionDeployService,
            ModListHtmlImportService modListHtmlImportService,
            ILogger logger)
        {
            this.paths = paths;
            this.settings = settings;
            this.automationService = automationService;
            this.missionDeployService = missionDeployService;
            this.modListHtmlImportService = modListHtmlImportService;
            this.logger = logger;
        }

        public void Start()
        {
            if (!settings.Inbox.Enabled)
            {
                return;
            }

            int seconds = settings.Inbox.PollSeconds;
            if (seconds < 1)
            {
                seconds = 5;
            }

            int intervalMs = seconds * 1000;
            timer = new Timer(OnTimer, null, intervalMs, intervalMs);
            logger.LogInformation(
                "Automation inbox watcher started. directory={Directory}",
                AgentSettingsLoader.GetInboxDirectory(paths));
        }

        public void Dispose()
        {
            timer?.Dispose();
        }

        private void OnTimer(object state)
        {
            if (Interlocked.CompareExchange(ref scanInProgress, 1, 0) != 0)
            {
                return;
            }

            try
            {
                ScanInbox();
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Inbox scan failed.");
            }
            finally
            {
                Interlocked.Exchange(ref scanInProgress, 0);
            }
        }

        private void ScanInbox()
        {
            string inbox = AgentSettingsLoader.GetInboxDirectory(paths);
            string processedDir = Path.Combine(inbox, "processed");
            string failedDir = Path.Combine(inbox, "failed");
            Directory.CreateDirectory(processedDir);
            Directory.CreateDirectory(failedDir);

            string[] files = Directory.GetFiles(inbox, "*.json");
            for (int i = 0; i < files.Length; i++)
            {
                ProcessJsonTask(files[i], processedDir, failedDir);
            }

            ScanInboxFolder(
                Path.Combine(inbox, "missions"),
                "*.pbo",
                processedDir,
                failedDir,
                ProcessMissionPbo);
            ScanInboxFolder(
                Path.Combine(inbox, "mod-lists"),
                "*.html",
                processedDir,
                failedDir,
                ProcessModListHtml);
        }

        private void ScanInboxFolder(
            string root,
            string pattern,
            string processedDir,
            string failedDir,
            Action<string, string, string, string> processor)
        {
            if (!Directory.Exists(root))
            {
                return;
            }

            string[] serverDirs = Directory.GetDirectories(root);
            for (int i = 0; i < serverDirs.Length; i++)
            {
                string serverDir = serverDirs[i];
                string serverUuid = Path.GetFileName(serverDir);
                string[] files = Directory.GetFiles(serverDir, pattern);
                for (int j = 0; j < files.Length; j++)
                {
                    processor(files[j], serverUuid, processedDir, failedDir);
                }
            }
        }

        private void ProcessMissionPbo(string filePath, string serverUuid, string processedDir, string failedDir)
        {
            try
            {
                using (FileStream stream = File.OpenRead(filePath))
                {
                    (OperationResult result, _) = missionDeployService.DeployPbo(
                        serverUuid,
                        Path.GetFileName(filePath),
                        stream,
                        true,
                        3);
                    MoveInboxFile(filePath, result.Success, processedDir, failedDir);
                    logger.LogInformation(
                        "Inbox mission {File} server={ServerUuid} success={Success}",
                        Path.GetFileName(filePath),
                        serverUuid,
                        result.Success);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Inbox mission failed {File}", filePath);
                MoveInboxFile(filePath, false, processedDir, failedDir);
            }
        }

        private void ProcessModListHtml(string filePath, string serverUuid, string processedDir, string failedDir)
        {
            try
            {
                string html = File.ReadAllText(filePath);
                (OperationResult result, _) = modListHtmlImportService.Import(
                    serverUuid,
                    html,
                    "download_and_enable");
                MoveInboxFile(filePath, result.Success, processedDir, failedDir);
                logger.LogInformation(
                    "Inbox mod-list {File} server={ServerUuid} success={Success}",
                    Path.GetFileName(filePath),
                    serverUuid,
                    result.Success);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Inbox mod-list failed {File}", filePath);
                MoveInboxFile(filePath, false, processedDir, failedDir);
            }
        }

        private static void MoveInboxFile(string filePath, bool success, string processedDir, string failedDir)
        {
            string targetDir = success ? processedDir : failedDir;
            string destination = Path.Combine(
                targetDir,
                Path.GetFileNameWithoutExtension(filePath) + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss")
                    + Path.GetExtension(filePath));
            File.Move(filePath, destination);
        }

        private void ProcessJsonTask(string filePath, string processedDir, string failedDir)
        {
            ProcessFile(filePath, processedDir, failedDir);
        }

        private void ProcessFile(string filePath, string processedDir, string failedDir)
        {
            try
            {
                AutomationRunResult result = automationService.ExecuteTaskFileAsync(filePath, CancellationToken.None)
                    .GetAwaiter()
                    .GetResult();
                string targetDir = result.Success ? processedDir : failedDir;
                string destination = Path.Combine(
                    targetDir,
                    Path.GetFileNameWithoutExtension(filePath) + "_" + DateTime.Now.ToString("yyyyMMdd_HHmmss")
                        + Path.GetExtension(filePath));
                File.Move(filePath, destination);
                logger.LogInformation(
                    "Processed inbox task {File}. success={Success}",
                    Path.GetFileName(filePath),
                    result.Success);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to process inbox file {File}", filePath);
                try
                {
                    string destination = Path.Combine(
                        failedDir,
                        Path.GetFileNameWithoutExtension(filePath) + "_error_" + DateTime.Now.ToString("yyyyMMdd_HHmmss")
                            + Path.GetExtension(filePath));
                    File.Move(filePath, destination);
                }
                catch (Exception moveEx)
                {
                    logger.LogWarning(moveEx, "Could not move failed inbox file.");
                }
            }
        }
    }
}
