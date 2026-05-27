using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Agent.Host.Configuration;
using Arma3ServerTools.Application.Automation;
using Arma3ServerTools.Core;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.Agent.Host.Inbox
{
    public sealed class AutomationInboxWatcher : IDisposable
    {
        private readonly IAppPaths paths;
        private readonly AgentSettings settings;
        private readonly IServerAutomationService automationService;
        private readonly ILogger logger;
        private Timer timer;
        private int scanInProgress;

        public AutomationInboxWatcher(
            IAppPaths paths,
            AgentSettings settings,
            IServerAutomationService automationService,
            ILogger logger)
        {
            this.paths = paths;
            this.settings = settings;
            this.automationService = automationService;
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
            string[] files = Directory.GetFiles(inbox, "*.json");
            for (int i = 0; i < files.Length; i++)
            {
                string filePath = files[i];
                ProcessFile(filePath, processedDir, failedDir);
            }
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
