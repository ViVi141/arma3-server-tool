using System;
using System.Windows.Forms;

namespace Arma3ServerTools.App.WinForms
{
    /// <summary>
    /// Coalesces rapid config sync indicator refreshes (e.g. while typing in settings).
    /// </summary>
    internal sealed class ConfigSyncIndicatorDebouncer : IDisposable
    {
        private readonly Control invokeTarget;
        private readonly Action refreshAction;
        private readonly System.Windows.Forms.Timer timer;
        private bool disposed;

        public ConfigSyncIndicatorDebouncer(Control invokeTarget, Action refreshAction, int delayMilliseconds)
        {
            if (invokeTarget == null)
            {
                throw new ArgumentNullException(nameof(invokeTarget));
            }

            if (refreshAction == null)
            {
                throw new ArgumentNullException(nameof(refreshAction));
            }

            this.invokeTarget = invokeTarget;
            this.refreshAction = refreshAction;
            timer = new System.Windows.Forms.Timer();
            timer.Interval = delayMilliseconds;
            timer.Tick += OnTimerTick;
        }

        public void Schedule()
        {
            if (disposed || invokeTarget.IsDisposed)
            {
                return;
            }

            timer.Stop();
            timer.Start();
        }

        public void Flush()
        {
            if (disposed || invokeTarget.IsDisposed)
            {
                return;
            }

            timer.Stop();
            refreshAction();
        }

        public void Dispose()
        {
            if (disposed)
            {
                return;
            }

            disposed = true;
            timer.Stop();
            timer.Dispose();
        }

        private void OnTimerTick(object sender, EventArgs e)
        {
            timer.Stop();
            if (disposed || invokeTarget.IsDisposed)
            {
                return;
            }

            refreshAction();
        }
    }
}
