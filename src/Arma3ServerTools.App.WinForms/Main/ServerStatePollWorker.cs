using System;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Forms;
using Arma3ServerTools.Application.Logging;
using Arma3ServerTools.Application.Services;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.App.WinForms.Main
{
    internal sealed class ServerStatePollWorker : IDisposable
    {
        private const int PollIntervalMs = 3000;

        private readonly IServerProcessService processService;
        private readonly Func<IReadOnlyList<string>> getServerUuids;
        private readonly Action<IReadOnlyList<ServerStatePollResult>> onResultsReady;
        private readonly Control invokeTarget;
        private readonly ILogger logger;
        private readonly System.Threading.Timer timer;
        private int pollInProgress;
        private bool disposed;

        public ServerStatePollWorker(
            IServerProcessService processService,
            Control invokeTarget,
            Func<IReadOnlyList<string>> getServerUuids,
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

            if (getServerUuids == null)
            {
                throw new ArgumentNullException(nameof(getServerUuids));
            }

            if (onResultsReady == null)
            {
                throw new ArgumentNullException(nameof(onResultsReady));
            }

            this.processService = processService;
            this.invokeTarget = invokeTarget;
            this.getServerUuids = getServerUuids;
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
                IReadOnlyList<string> uuids = getServerUuids();
                if (uuids == null || uuids.Count == 0)
                {
                    return;
                }

                var results = new List<ServerStatePollResult>(uuids.Count);
                for (int i = 0; i < uuids.Count; i++)
                {
                    string uuid = uuids[i];
                    if (string.IsNullOrEmpty(uuid))
                    {
                        continue;
                    }

                    ServerRunState runState = processService.SyncState(uuid);
                    results.Add(new ServerStatePollResult(uuid, runState));
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
