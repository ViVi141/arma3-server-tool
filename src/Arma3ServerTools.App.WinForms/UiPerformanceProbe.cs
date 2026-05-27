using System;
using System.Diagnostics;
using Arma3ServerTools.Application.Logging;
using Microsoft.Extensions.Logging;

namespace Arma3ServerTools.App.WinForms
{
    internal static class UiPerformanceProbe
    {
        private static readonly ILogger Logger = AppLogging.CreateLogger("UiPerformance");

        public static IDisposable BeginScope(string operation, string context)
        {
            return new Scope(operation, context);
        }

        public static void LogDuration(string operation, long elapsedMs, string context)
        {
            if (string.IsNullOrWhiteSpace(context))
            {
                Logger.LogInformation("UI_PERF op={Operation} elapsed_ms={ElapsedMs}", operation, elapsedMs);
                return;
            }

            Logger.LogInformation(
                "UI_PERF op={Operation} elapsed_ms={ElapsedMs} context={Context}",
                operation,
                elapsedMs,
                context);
        }

        private sealed class Scope : IDisposable
        {
            private readonly string operation;
            private readonly string context;
            private readonly Stopwatch stopwatch;

            public Scope(string operation, string context)
            {
                this.operation = operation;
                this.context = context;
                stopwatch = Stopwatch.StartNew();
            }

            public void Dispose()
            {
                stopwatch.Stop();
                LogDuration(operation, stopwatch.ElapsedMilliseconds, context);
            }
        }
    }
}
