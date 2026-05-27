using System;
using System.Threading;

namespace Arma3ServerTools.App.WinForms
{
    /// <summary>
    /// 阻止同一用户会话内启动多个主程序实例。
    /// </summary>
    internal sealed class SingleInstanceGuard : IDisposable
    {
        private const string MutexName = "Local\\Arma3ServerTools.SingleInstance.v1";

        private readonly Mutex mutex;
        private readonly bool isFirstInstance;
        private bool disposed;

        public SingleInstanceGuard()
        {
            mutex = new Mutex(true, MutexName, out isFirstInstance);
        }

        public bool IsFirstInstance
        {
            get { return isFirstInstance; }
        }

        public void Dispose()
        {
            if (disposed)
            {
                return;
            }

            disposed = true;
            if (isFirstInstance && mutex != null)
            {
                try
                {
                    mutex.ReleaseMutex();
                }
                catch (ApplicationException)
                {
                }

                mutex.Dispose();
            }
        }
    }
}
