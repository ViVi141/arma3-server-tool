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
            queue.CompleteAdding();
            cancellation.Cancel();
            try
            {
                worker.Wait(3000);
            }
            catch
            {
            }

            cancellation.Dispose();
            queue.Dispose();
        }

        private void ProcessLoop()
        {
            try
            {
                foreach (string message in queue.GetConsumingEnumerable(cancellation.Token))
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
            catch (OperationCanceledException)
            {
            }
        }
    }
}
