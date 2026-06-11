using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
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
        private int disposed;

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
            if (IsDisposed())
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
            if (Interlocked.Exchange(ref disposed, 1) != 0)
            {
                return;
            }

            Stop();
            timer.Dispose();
        }

        private void OnTimerElapsed(object state)
        {
            if (IsDisposed() || invokeTarget.IsDisposed || !invokeTarget.IsHandleCreated)
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

                Task.Run(
                    () => PollStates(configs),
                    CancellationToken.None)
                    .ContinueWith(
                        task =>
                        {
                            if (task.IsFaulted)
                            {
                                logger.LogWarning(task.Exception, "Background server state poll failed.");
                                return;
                            }

                            if (IsDisposed() || invokeTarget.IsDisposed || !invokeTarget.IsHandleCreated)
                            {
                                return;
                            }

                            IReadOnlyList<ServerStatePollResult> results = task.Result;
                            if (results == null || results.Count == 0)
                            {
                                return;
                            }

                            try
                            {
                                invokeTarget.BeginInvoke(new Action(() =>
                                {
                                    if (IsDisposed() || invokeTarget.IsDisposed)
                                    {
                                        return;
                                    }

                                    onResultsReady(results);
                                }));
                            }
                            catch (ObjectDisposedException)
                            {
                                // Control disposed after checks; safe to skip.
                            }
                            catch (InvalidOperationException)
                            {
                                // Control is disposing/disposed between checks and BeginInvoke; safe to skip.
                            }
                        },
                        CancellationToken.None,
                        TaskContinuationOptions.None,
                        TaskScheduler.Default);
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

        private List<ServerStatePollResult> PollStates(IReadOnlyList<ArmaServerConfig> configs)
        {
            var results = new List<ServerStatePollResult>(configs.Count);
            for (int i = 0; i < configs.Count; i++)
            {
                ArmaServerConfig config = configs[i];
                if (config == null || string.IsNullOrEmpty(config.ServerUUID))
                {
                    continue;
                }

                int pidBefore = config.ServerTaskManagement.ProcessById;
                ServerRunState runState = processService.PeekState(config);
                bool persistedBySyncState = false;
                if (pidBefore > 0 && runState == ServerRunState.Stopped)
                {
                    runState = processService.SyncState(config);
                    persistedBySyncState =
                        runState == ServerRunState.Stopped
                        && config.ServerTaskManagement.ProcessById == 0;
                }

                results.Add(new ServerStatePollResult(config.ServerUUID, runState, persistedBySyncState));
            }

            return results;
        }

        private bool IsDisposed()
        {
            return Volatile.Read(ref disposed) != 0;
        }
    }
}
