using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
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

    /// <summary>
    /// 扩展性能指标收集
    /// </summary>
    public static class PerformanceMetrics
    {
        private static readonly ConcurrentDictionary<string, PerformanceCounter> Counters =
            new ConcurrentDictionary<string, PerformanceCounter>();

        public static void RecordOperation(string operation, long durationMs, long memoryBytes = 0)
        {
            if (!Arma3ServerTools.Core.PerformanceFeatures.EnableExtendedPerformanceMonitoring)
            {
                return;
            }

            var counter = Counters.GetOrAdd(operation, _ => new PerformanceCounter());
            counter.Record(durationMs, memoryBytes);
        }

        public static Dictionary<string, PerformanceStats> GetStats()
        {
            var result = new Dictionary<string, PerformanceStats>();
            foreach (var kvp in Counters)
            {
                result[kvp.Key] = kvp.Value.GetStats();
            }
            return result;
        }

        public static void Reset()
        {
            Counters.Clear();
        }
    }

    internal class PerformanceCounter
    {
        private readonly object lockObj = new object();
        private readonly List<long> durations = new List<long>();
        private readonly List<long> memorySizes = new List<long>();

        public void Record(long durationMs, long memoryBytes)
        {
            lock (lockObj)
            {
                durations.Add(durationMs);
                if (memoryBytes > 0)
                {
                    memorySizes.Add(memoryBytes);
                }
            }
        }

        public PerformanceStats GetStats()
        {
            lock (lockObj)
            {
                if (durations.Count == 0)
                {
                    return new PerformanceStats();
                }

                var sortedDurations = durations.OrderBy(x => x).ToList();
                return new PerformanceStats
                {
                    Count = durations.Count,
                    AverageDurationMs = durations.Average(),
                    MinDurationMs = sortedDurations.First(),
                    MaxDurationMs = sortedDurations.Last(),
                    P95DurationMs = GetPercentile(sortedDurations, 0.95),
                    P99DurationMs = GetPercentile(sortedDurations, 0.99),
                    TotalMemoryBytes = memorySizes.Sum(),
                    AverageMemoryBytes = memorySizes.Count > 0 ? memorySizes.Average() : 0
                };
            }
        }

        private static long GetPercentile(List<long> sortedValues, double percentile)
        {
            if (sortedValues.Count == 0) return 0;
            int index = (int)Math.Ceiling(sortedValues.Count * percentile) - 1;
            index = Math.Max(0, Math.Min(index, sortedValues.Count - 1));
            return sortedValues[index];
        }
    }

    public class PerformanceStats
    {
        public int Count { get; set; }
        public double AverageDurationMs { get; set; }
        public long MinDurationMs { get; set; }
        public long MaxDurationMs { get; set; }
        public long P95DurationMs { get; set; }
        public long P99DurationMs { get; set; }
        public long TotalMemoryBytes { get; set; }
        public double AverageMemoryBytes { get; set; }
    }
}
