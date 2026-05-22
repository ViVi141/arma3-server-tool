using System;
using System.IO;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.Application.Logging
{
    internal sealed class FileLoggerProvider : ILoggerProvider
    {
        private readonly string logFilePath;
        private readonly object writeLock = new object();

        public FileLoggerProvider(string logFilePath)
        {
            this.logFilePath = logFilePath;
        }

        public ILogger CreateLogger(string categoryName)
        {
            return new FileLogger(categoryName, logFilePath, writeLock);
        }

        public void Dispose()
        {
        }

        private sealed class FileLogger : ILogger
        {
            private readonly string categoryName;
            private readonly string logFilePath;
            private readonly object writeLock;

            public FileLogger(string categoryName, string logFilePath, object writeLock)
            {
                this.categoryName = categoryName;
                this.logFilePath = logFilePath;
                this.writeLock = writeLock;
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

                lock (writeLock)
                {
                    File.AppendAllText(logFilePath, line + Environment.NewLine);
                }
            }
        }

        private sealed class NullScope : IDisposable
        {
            public static readonly NullScope Instance = new NullScope();

            public void Dispose()
            {
            }
        }
    }
}
