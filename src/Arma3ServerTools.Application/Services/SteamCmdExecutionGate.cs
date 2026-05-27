using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;

namespace Arma3ServerTools.Application.Services
{
    /// <summary>
    /// Ensures only one SteamCMD process runs at a time across GUI, Agent, and bootstrap.
    /// </summary>
    public static class SteamCmdExecutionGate
    {
        private static readonly SemaphoreSlim Semaphore = new SemaphoreSlim(1, 1);

        private static volatile string currentOperation;

        private static volatile int trackedProcessId = -1;

        public static SteamCmdStatusSnapshot GetStatus()
        {
            return new SteamCmdStatusSnapshot
            {
                IsGateHeld = Semaphore.CurrentCount == 0,
                CurrentOperation = currentOperation,
                RunningProcessCount = CountSteamCmdProcesses(),
                TrackedProcessId = trackedProcessId,
            };
        }

        public static SteamCmdTerminationResult TerminateAll()
        {
            var result = new SteamCmdTerminationResult();
            result.GateWasHeld = Semaphore.CurrentCount == 0;
            result.KilledProcessCount = KillAllSteamCmdProcesses();
            ForceRelease();
            result.GateReleased = result.GateWasHeld;
            result.Success = true;
            if (result.KilledProcessCount > 0)
            {
                result.Message = "已终止 " + result.KilledProcessCount + " 个 steamcmd 进程。";
            }
            else if (result.GateWasHeld)
            {
                result.Message = "未发现 steamcmd 进程，已释放工具内 SteamCMD 占用锁。";
            }
            else
            {
                result.Message = "当前没有由本工具跟踪的 SteamCMD 进程。";
            }

            if (result.GateReleased)
            {
                result.Message = result.Message + " 可重新发起下载。";
            }

            return result;
        }

        public static bool HasRunningSteamCmdProcess()
        {
            return CountSteamCmdProcesses() > 0;
        }

        public static bool TryEnter(string operationDescription, int waitTimeoutMilliseconds, out string busyMessage)
        {
            busyMessage = null;
            if (waitTimeoutMilliseconds < 0)
            {
                waitTimeoutMilliseconds = 0;
            }

            if (Semaphore.CurrentCount > 0 && HasForeignSteamCmdProcess())
            {
                busyMessage = "检测到系统已有 steamcmd.exe 在运行（可能由其他程序或手动打开）。"
                    + " 本工具同一时间仅允许一个 SteamCMD，请先关闭现有窗口后再试。";
                return false;
            }

            if (!Semaphore.Wait(waitTimeoutMilliseconds))
            {
                string running = currentOperation;
                if (string.IsNullOrWhiteSpace(running))
                {
                    running = "SteamCMD";
                }

                busyMessage = "已有 SteamCMD 正在执行（" + running + "）。"
                    + " 同一时间仅允许一个 SteamCMD 进程，请等待完成后再试。";
                return false;
            }

            currentOperation = operationDescription;
            return true;
        }

        public static string BuildAlreadyRunningMessage()
        {
            return "检测到已有 steamcmd.exe 在运行。本工具同一时间仅允许一个 SteamCMD，"
                + "请先关闭现有窗口或使用 stop_steamcmd。";
        }

        public static void Exit()
        {
            currentOperation = null;
            trackedProcessId = -1;
            try
            {
                Semaphore.Release();
            }
            catch (SemaphoreFullException)
            {
            }
        }

        public static void ForceRelease()
        {
            currentOperation = null;
            trackedProcessId = -1;
            if (Semaphore.CurrentCount == 0)
            {
                try
                {
                    Semaphore.Release();
                }
                catch (SemaphoreFullException)
                {
                }
            }
        }

        public static void AttachProcessExitRelease(int processId)
        {
            if (processId <= 0)
            {
                Exit();
                return;
            }

            trackedProcessId = processId;
            Task.Run(
                () =>
                {
                    try
                    {
                        using (Process process = Process.GetProcessById(processId))
                        {
                            process.WaitForExit();
                        }
                    }
                    catch (Exception)
                    {
                    }
                    finally
                    {
                        if (trackedProcessId == processId)
                        {
                            trackedProcessId = -1;
                        }

                        Exit();
                    }
                });
        }

        private static bool HasForeignSteamCmdProcess()
        {
            return CountSteamCmdProcesses() > 0;
        }

        private static int CountSteamCmdProcesses()
        {
            Process[] processes = GetSteamCmdProcesses();
            if (processes == null)
            {
                return 0;
            }

            int count = processes.Length;
            DisposeProcesses(processes);
            return count;
        }

        private static int KillAllSteamCmdProcesses()
        {
            Process[] processes = GetSteamCmdProcesses();
            if (processes == null || processes.Length == 0)
            {
                return 0;
            }

            int killed = 0;
            for (int i = 0; i < processes.Length; i++)
            {
                try
                {
                    if (!processes[i].HasExited)
                    {
                        processes[i].Kill(entireProcessTree: true);
                        killed++;
                    }
                }
                catch (Exception)
                {
                }
                finally
                {
                    processes[i].Dispose();
                }
            }

            return killed;
        }

        private static Process[] GetSteamCmdProcesses()
        {
            try
            {
                return Process.GetProcessesByName("steamcmd");
            }
            catch (Exception)
            {
                return null;
            }
        }

        private static void DisposeProcesses(Process[] processes)
        {
            if (processes == null)
            {
                return;
            }

            for (int i = 0; i < processes.Length; i++)
            {
                processes[i].Dispose();
            }
        }
    }
}
