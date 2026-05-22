using System.Threading;
using System.Threading.Tasks;

namespace Arma3ServerTools.Core.Threading
{
    /// <summary>
    /// Manual-reset event with async wait; replaces Nito.AsyncEx dependency.
    /// </summary>
    public sealed class AsyncManualResetEvent
    {
        private readonly object sync = new object();
        private TaskCompletionSource<bool> completionSource;

        public AsyncManualResetEvent(bool isSet = false)
        {
            completionSource = CreateCompletionSource();
            if (isSet)
            {
                completionSource.TrySetResult(true);
            }
        }

        public bool IsSet
        {
            get
            {
                lock (sync)
                {
                    return completionSource.Task.IsCompleted;
                }
            }
        }

        public void Set()
        {
            lock (sync)
            {
                completionSource.TrySetResult(true);
            }
        }

        public void Reset()
        {
            lock (sync)
            {
                if (!completionSource.Task.IsCompleted)
                {
                    return;
                }

                completionSource = CreateCompletionSource();
            }
        }

        public void Wait()
        {
            Wait(CancellationToken.None);
        }

        public void Wait(CancellationToken cancellationToken)
        {
            Task task = GetWaitTask();
            if (!task.IsCompleted)
            {
                task.Wait(cancellationToken);
            }
        }

        public Task WaitAsync(CancellationToken cancellationToken)
        {
            return GetWaitTask().WaitAsync(cancellationToken);
        }

        private Task GetWaitTask()
        {
            lock (sync)
            {
                return completionSource.Task;
            }
        }

        private static TaskCompletionSource<bool> CreateCompletionSource()
        {
            return new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        }
    }
}
