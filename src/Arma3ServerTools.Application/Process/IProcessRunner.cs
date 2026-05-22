using System.Diagnostics;

namespace Arma3ServerTools.Application.ProcessManagement
{
    public interface IProcessRunner
    {
        ProcessStartResult Start(string fileName, string arguments, string workingDirectory = null);

        bool TryKill(int processId);

        bool IsRunning(int processId);
    }

    public sealed class ProcessStartResult
    {
        public bool Success { get; private set; }

        public int ProcessId { get; private set; }

        public string Message { get; private set; }

        public static ProcessStartResult Ok(int processId)
        {
            return new ProcessStartResult
            {
                Success = true,
                ProcessId = processId,
            };
        }

        public static ProcessStartResult Fail(string message)
        {
            return new ProcessStartResult
            {
                Success = false,
                Message = message,
            };
        }
    }

    public sealed class SystemProcessRunner : IProcessRunner
    {
        public ProcessStartResult Start(string fileName, string arguments, string workingDirectory = null)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                };
                if (!string.IsNullOrWhiteSpace(workingDirectory))
                {
                    startInfo.WorkingDirectory = workingDirectory;
                }

                Process process = Process.Start(startInfo);

                if (process == null)
                {
                    return ProcessStartResult.Fail("进程启动返回 null。");
                }

                return ProcessStartResult.Ok(process.Id);
            }
            catch (System.Exception ex)
            {
                return ProcessStartResult.Fail(ex.Message);
            }
        }

        public bool TryKill(int processId)
        {
            try
            {
                Process.GetProcessById(processId).Kill();
                return true;
            }
            catch
            {
                return false;
            }
        }

        public bool IsRunning(int processId)
        {
            if (processId <= 0)
            {
                return false;
            }

            try
            {
                Process.GetProcessById(processId);
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
