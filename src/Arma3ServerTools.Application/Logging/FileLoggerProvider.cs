using System;
using System.Collections.Concurrent;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.Application.Logging
{
    internal sealed class FileLoggerProvider : ILoggerProvider
    {
        private readonly string logFilePath;
        private readonly BlockingCollection<string> writeQueue;
        private readonly CancellationTokenSource cancellationTokenSource;
        private readonly Task writerTask;
        private int disposed;

        public FileLoggerProvider(string logFilePath)
        {
            this.logFilePath = logFilePath;
            writeQueue = new BlockingCollection<string>(new ConcurrentQueue<string>(), 8192);
            cancellationTokenSource = new CancellationTokenSource();
            writerTask = Task.Run(ProcessLogQueue);
        }

        public ILogger CreateLogger(string categoryName)
        {
            return new FileLogger(categoryName, this);
        }

        public void Dispose()
        {
            if (Interlocked.Exchange(ref disposed, 1) != 0)
            {
                return;
            }

            writeQueue.CompleteAdding();
            if (!writerTask.Wait(TimeSpan.FromSeconds(3)))
            {
                cancellationTokenSource.Cancel();
                writerTask.Wait(TimeSpan.FromSeconds(1));
            }

            cancellationTokenSource.Dispose();
            writeQueue.Dispose();
        }

        private sealed class FileLogger : ILogger
        {
            private readonly string categoryName;
            private readonly FileLoggerProvider provider;

            public FileLogger(string categoryName, FileLoggerProvider provider)
            {
                this.categoryName = categoryName;
                this.provider = provider;
            }

            public IDisposable BeginScope<TState>(TState state)
            {
                return NullScope.Instance;
            }

            public bool IsEnabled(LogLevel logLevel)
            {
                return logLevel >= LogLevel.Information;
            }

            public void Log<TState>(
                LogLevel logLevel,
                EventId eventId,
                TState state,
                Exception exception,
                Func<TState, Exception, string> formatter)
            {
                if (!IsEnabled(logLevel))
                {
                    return;
                }

                string message = formatter(state, exception);
                if (string.IsNullOrEmpty(message) && exception == null)
                {
                    return;
                }

                string line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff")
                    + " ["
                    + logLevel
                    + "] "
                    + categoryName
                    + ": "
                    + message;
                if (exception != null)
                {
                    line += Environment.NewLine + exception;
                }

                provider.Enqueue(line + Environment.NewLine);
            }
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new NullScope();

            public void Dispose()
            {
            }
        }

        private void Enqueue(string line)
        {
            if (disposed != 0)
            {
                return;
            }

            if (!writeQueue.TryAdd(line))
            {
                // Queue is full, drop this log line to avoid blocking caller threads.
            }
        }

        private void ProcessLogQueue()
        {
            string directory = Path.GetDirectoryName(logFilePath);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            using (var stream = new FileStream(logFilePath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
            using (var writer = new StreamWriter(stream, new UTF8Encoding(false)))
            {
                try
                {
                    while (!writeQueue.IsCompleted && !cancellationTokenSource.IsCancellationRequested)
                    {
                        string line;
                        if (!writeQueue.TryTake(out line, 500, cancellationTokenSource.Token))
                        {
                            writer.Flush();
                            continue;
                        }

                        writer.Write(line);
                        DrainQueue(writer);
                        writer.Flush();
                    }
                }
                catch (OperationCanceledException)
                {
                }

                DrainRemaining(writer);
                writer.Flush();
            }
        }

        private void DrainQueue(StreamWriter writer)
        {
            string line;
            while (writeQueue.TryTake(out line))
            {
                writer.Write(line);
            }
        }

        private void DrainRemaining(StreamWriter writer)
        {
            string line;
            while (writeQueue.TryTake(out line))
            {
                writer.Write(line);
            }
        }
    }
}
