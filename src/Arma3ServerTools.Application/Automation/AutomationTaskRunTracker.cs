using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;

namespace Arma3ServerTools.Application.Automation
{
    public enum AutomationTaskRunStatus
    {
        Accepted = 0,
        Running = 1,
        Succeeded = 2,
        Failed = 3,
    }

    public sealed class AutomationTaskRunState
    {
        public string TaskId { get; set; }

        public AutomationTaskRunStatus Status { get; set; }

        public AutomationRunResult Result { get; set; }

        public DateTime CreatedUtc { get; set; }

        public DateTime? FinishedUtc { get; set; }
    }

    public sealed class AutomationTaskRunTracker
    {
        private readonly ConcurrentDictionary<string, AutomationTaskRunState> runs =
            new ConcurrentDictionary<string, AutomationTaskRunState>(StringComparer.OrdinalIgnoreCase);

        private int taskSequence;

        public string Submit(Func<AutomationRunResult> execute)
        {
            string taskId = "t-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss")
                + "-" + Interlocked.Increment(ref taskSequence).ToString("D4");
            var state = new AutomationTaskRunState
            {
                TaskId = taskId,
                Status = AutomationTaskRunStatus.Accepted,
                CreatedUtc = DateTime.UtcNow,
            };
            runs[taskId] = state;

            Task.Run(
                () =>
                {
                    state.Status = AutomationTaskRunStatus.Running;
                    try
                    {
                        AutomationRunResult result = execute();
                        state.Result = result;
                        if (result != null && result.Success)
                        {
                            state.Status = AutomationTaskRunStatus.Succeeded;
                        }
                        else
                        {
                            state.Status = AutomationTaskRunStatus.Failed;
                        }
                    }
                    catch (Exception ex)
                    {
                        state.Result = new AutomationRunResult
                        {
                            Success = false,
                            Message = ex.Message,
                        };
                        state.Status = AutomationTaskRunStatus.Failed;
                    }
                    finally
                    {
                        state.FinishedUtc = DateTime.UtcNow;
                    }
                });

            return taskId;
        }

        public AutomationTaskRunState Get(string taskId)
        {
            if (string.IsNullOrWhiteSpace(taskId))
            {
                return null;
            }

            runs.TryGetValue(taskId, out AutomationTaskRunState state);
            return state;
        }
    }
}
