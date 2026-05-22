using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Monitoring;

namespace Arma3ServerTools.Application.Services
{
    public sealed class QueuedMonitoringIngestService : IMonitoringIngestService, IDisposable
    {
        private readonly MonitoringIngestService inner;
        private readonly BlockingCollection<string> queue;
        private readonly CancellationTokenSource cancellation;
        private readonly Task worker;
        private bool disposed;

        public QueuedMonitoringIngestService(MonitoringDatabase database)
        {
            inner = new MonitoringIngestService(database);
            queue = new BlockingCollection<string>();
            cancellation = new CancellationTokenSource();
            worker = Task.Run(ProcessLoop);
        }

        public void Ingest(string rawMessage)
        {
            if (string.IsNullOrWhiteSpace(rawMessage))
            {
                return;
            }

            queue.Add(rawMessage);
        }

        public void Dispose()
        {
            if (disposed)
            {
                return;
            }

            disposed = true;
            queue.CompleteAdding();
            if (!worker.Wait(TimeSpan.FromSeconds(5)))
            {
                cancellation.Cancel();
                worker.Wait(TimeSpan.FromSeconds(1));
            }

            cancellation.Dispose();
            queue.Dispose();
        }

        private void ProcessLoop()
        {
            try
            {
                foreach (string message in queue.GetConsumingEnumerable())
                {
                    try
                    {
                        inner.Ingest(message);
                    }
                    catch
                    {
                    }
                }
            }
            catch (InvalidOperationException)
            {
            }
        }
    }
}
