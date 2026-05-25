using System;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Forms;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Models;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.App.WinForms.Main
{
    internal sealed class ServerStatePollWorker : IDisposable
    {
        private const int PollIntervalMs = 3000;

        private readonly IServerProcessService processService;
        private readonly Func<IReadOnlyList<ArmaServerConfig>> getServerConfigs;
        private readonly Action<IReadOnlyList<ServerStatePollResult>> onResultsReady;
        private readonly Control invokeTarget;
        private readonly ILogger logger;
        private readonly System.Threading.Timer timer;
        private int pollInProgress;
        private bool disposed;

        public ServerStatePollWorker(
            IServerProcessService processService,
            Control invokeTarget,
            Func<IReadOnlyList<ArmaServerConfig>> getServerConfigs,
            Action<IReadOnlyList<ServerStatePollResult>> onResultsReady)
        {
            if (processService == null)
            {
                throw new ArgumentNullException(nameof(processService));
            }

            if (invokeTarget == null)
            {
                throw new ArgumentNullException(nameof(invokeTarget));
            }

            if (getServerConfigs == null)
            {
                throw new ArgumentNullException(nameof(getServerConfigs));
            }

            if (onResultsReady == null)
            {
                throw new ArgumentNullException(nameof(onResultsReady));
            }

            this.processService = processService;
            this.invokeTarget = invokeTarget;
            this.getServerConfigs = getServerConfigs;
            this.onResultsReady = onResultsReady;
            logger = AppLogging.CreateLogger("ServerStatePollWorker");
            timer = new System.Threading.Timer(OnTimerElapsed, null, Timeout.Infinite, Timeout.Infinite);
        }

        public void Start()
        {
            if (disposed)
            {
                return;
            }

            timer.Change(PollIntervalMs, PollIntervalMs);
        }

        public void Stop()
        {
            timer.Change(Timeout.Infinite, Timeout.Infinite);
        }

        public void Dispose()
        {
            if (disposed)
            {
                return;
            }

            disposed = true;
            Stop();
            timer.Dispose();
        }

        private void OnTimerElapsed(object state)
        {
            if (disposed || invokeTarget.IsDisposed)
            {
                return;
            }

            if (Interlocked.CompareExchange(ref pollInProgress, 1, 0) != 0)
            {
                return;
            }

            try
            {
                IReadOnlyList<ArmaServerConfig> configs = getServerConfigs();
                if (configs == null || configs.Count == 0)
                {
                    return;
                }

                var results = new List<ServerStatePollResult>(configs.Count);
                for (int i = 0; i < configs.Count; i++)
                {
                    ArmaServerConfig config = configs[i];
                    if (config == null || string.IsNullOrEmpty(config.ServerUUID))
                    {
                        continue;
                    }

                    int pidBefore = config.ServerTaskManagement.ProcessById;
                    ServerRunState runState = processService.SyncState(config);
                    bool persistedBySyncState =
                        pidBefore > 0
                        && runState == ServerRunState.Stopped
                        && config.ServerTaskManagement.ProcessById == 0;
                    results.Add(new ServerStatePollResult(config.ServerUUID, runState, persistedBySyncState));
                }

                if (disposed || invokeTarget.IsDisposed)
                {
                    return;
                }

                invokeTarget.BeginInvoke(new Action(() =>
                {
                    if (disposed || invokeTarget.IsDisposed)
                    {
                        return;
                    }

                    onResultsReady(results);
                }));
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Background server state poll failed.");
            }
            finally
            {
                Interlocked.Exchange(ref pollInProgress, 0);
            }
        }
    }
}
