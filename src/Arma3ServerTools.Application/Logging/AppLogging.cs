using System;
using System.IO;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.Application.Logging
{
    public static class AppLogging
    {
        private static ILoggerFactory factory;
        private static bool initialized;

        public static void Initialize(string logDirectory)
        {
            if (initialized)
            {
                return;
            }

            if (string.IsNullOrEmpty(logDirectory))
            {
                logDirectory = AppContext.BaseDirectory;
            }

            Directory.CreateDirectory(logDirectory);
            string logFilePath = Path.Combine(logDirectory, "a3st.log");

            factory = Microsoft.Extensions.Logging.LoggerFactory.Create(builder =>
            {
                builder
                    .SetMinimumLevel(LogLevel.Information)
                    .AddProvider(new FileLoggerProvider(logFilePath));
            });

            initialized = true;
        }

        public static ILoggerFactory LoggerFactory
        {
            get
            {
                EnsureInitialized();
                return factory;
            }
        }

        public static ILogger CreateLogger(string categoryName)
        {
            EnsureInitialized();
            return factory.CreateLogger(categoryName);
        }

        public static ILogger<T> CreateLogger<T>()
        {
            EnsureInitialized();
            return factory.CreateLogger<T>();
        }

        public static void Shutdown()
        {
            if (factory != null)
            {
                factory.Dispose();
                factory = null;
            }

            initialized = false;
        }

        private static void EnsureInitialized()
        {
            if (!initialized)
            {
                Initialize(AppContext.BaseDirectory);
            }
        }
    }
}
