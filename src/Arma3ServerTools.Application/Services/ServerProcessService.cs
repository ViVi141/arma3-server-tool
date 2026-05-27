using System;
using System.Diagnostics;
using System.IO;
using Arma3ServerTools.Application.ProcessManagement;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Application.Services
{
    public sealed class ServerProcessService : IServerProcessService
    {
        private readonly IServerConfigService configService;
        private readonly IGameConfigWriter configWriter;
        private readonly IProcessRunner processRunner;
        private readonly MonitoringDeploymentService monitoringDeploymentService;

        public ServerProcessService(
            IServerConfigService configService,
            IGameConfigWriter configWriter,
            IProcessRunner processRunner,
            MonitoringDeploymentService monitoringDeploymentService)
        {
            this.configService = configService;
            this.configWriter = configWriter;
            this.processRunner = processRunner;
            this.monitoringDeploymentService = monitoringDeploymentService;
        }

        public OperationResult Start(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            return Start(config);
        }

        public OperationResult Start(ArmaServerConfig config)
        {
            if (config == null)
            {
                return OperationResult.Fail("未找到服务器配置。");
            }

            OperationResult writeResult = configWriter.WriteAll(config);
            if (!writeResult.Success)
            {
                return writeResult;
            }

            OperationResult deployResult = monitoringDeploymentService.DeployIfEnabled(config);
            if (!deployResult.Success)
            {
                return deployResult;
            }

            configWriter.BuildStartCommandLine(config);
            string executable = GetServerExecutablePath(config);
            if (!File.Exists(executable))
            {
                return OperationResult.Fail("找不到服务器可执行文件: " + executable);
            }

            ProcessStartResult startResult = processRunner.Start(executable, config.StartCommandLine, config.ServerDir);
            if (!startResult.Success)
            {
                return OperationResult.Fail("启动失败: " + startResult.Message);
            }

            config.ServerTaskManagement.ProcessById = startResult.ProcessId;

            // 验证进程是否已在运行中
            if (!processRunner.IsRunning(startResult.ProcessId))
            {
                config.ServerTaskManagement.ProcessById = 0;
                configService.Save(config);
                return OperationResult.Fail("进程已退出: " + startResult.Message);
            }

            configService.Save(config);

            // 短时等待后二次验证进程存活
            System.Threading.Thread.Sleep(2000);
            if (!processRunner.IsRunning(startResult.ProcessId))
            {
                config.ServerTaskManagement.ProcessById = 0;
                configService.Save(config);
                return OperationResult.Fail("进程启动后2秒内已退出，请检查模板/模组配置。");
            }

            return OperationResult.Ok();
        }

        public OperationResult Stop(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            return Stop(config);
        }

        public OperationResult Stop(ArmaServerConfig config)
        {
            if (config == null)
            {
                return OperationResult.Fail("未找到服务器配置。");
            }

            int pid = config.ServerTaskManagement.ProcessById;
            if (pid <= 0)
            {
                return OperationResult.Fail("服务器未在运行或 PID 无效。");
            }

            if (processRunner.IsRunning(pid))
            {
                ProcessIdentityStatus identityStatus = GetProcessIdentityStatus(pid, config);
                if (identityStatus == ProcessIdentityStatus.Mismatch)
                {
                    return OperationResult.Fail("检测到 PID=" + pid + " 对应进程不是当前服务器进程，已取消停止以避免误杀。");
                }

                if (identityStatus == ProcessIdentityStatus.Unknown)
                {
                    return OperationResult.Fail("无法验证 PID=" + pid + " 的进程身份，已取消停止以避免误杀。");
                }

                if (!processRunner.TryKill(pid))
                {
                    return OperationResult.Fail("停止进程失败，PID=" + pid);
                }
            }

            config.ServerTaskManagement.ProcessById = 0;
            configService.Save(config);
            return OperationResult.Ok();
        }

        public ServerRunState GetState(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            return GetState(config);
        }

        public ServerRunState GetState(ArmaServerConfig config)
        {
            if (config == null)
            {
                return ServerRunState.Stopped;
            }

            return ResolveState(config, clearStaleProcessId: false);
        }

        public ServerRunState SyncState(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            return SyncState(config);
        }

        public ServerRunState SyncState(ArmaServerConfig config)
        {
            if (config == null)
            {
                return ServerRunState.Stopped;
            }

            return ResolveState(config, clearStaleProcessId: true);
        }

        private ServerRunState ResolveState(ArmaServerConfig config, bool clearStaleProcessId)
        {
            int pid = config.ServerTaskManagement.ProcessById;
            if (pid <= 0)
            {
                return ServerRunState.Stopped;
            }

            if (!processRunner.IsRunning(pid))
            {
                if (clearStaleProcessId)
                {
                    config.ServerTaskManagement.ProcessById = 0;
                    configService.Save(config);
                }

                return ServerRunState.Stopped;
            }

            ProcessIdentityStatus identityStatus = GetProcessIdentityStatus(pid, config);
            if (identityStatus == ProcessIdentityStatus.Match)
            {
                return ServerRunState.Running;
            }

            return ServerRunState.Stopped;
        }

        public OperationResult StartHeadlessClient(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            if (config == null)
            {
                return OperationResult.Fail("未找到服务器配置。");
            }

            string args = configWriter.BuildHeadlessClientCommandLine(config);
            string executable = GetServerExecutablePath(config);
            if (!File.Exists(executable))
            {
                return OperationResult.Fail("找不到服务器可执行文件: " + executable);
            }

            ProcessStartResult startResult = processRunner.Start(executable, args, config.ServerDir);
            if (!startResult.Success)
            {
                return OperationResult.Fail("启动 Headless Client 失败: " + startResult.Message);
            }

            return OperationResult.Ok();
        }

        public OperationResult DetectRestart(string serverUuid)
        {
            if (SyncState(serverUuid) == ServerRunState.Running)
            {
                return OperationResult.Ok();
            }

            return Start(serverUuid);
        }

        private static string GetServerExecutablePath(ArmaServerConfig config)
        {
            string fileName;
            if (config.x64)
            {
                fileName = "arma3server_x64.exe";
            }
            else
            {
                fileName = "arma3server.exe";
            }

            return Path.Combine(config.ServerDir, fileName);
        }

        private ProcessIdentityStatus GetProcessIdentityStatus(int pid, ArmaServerConfig config)
        {
            if (processRunner.GetType() != typeof(SystemProcessRunner))
            {
                return ProcessIdentityStatus.Match;
            }

            string expectedExecutablePath = GetServerExecutablePath(config);
            if (string.IsNullOrWhiteSpace(expectedExecutablePath))
            {
                return ProcessIdentityStatus.Unknown;
            }

            string expectedFullPath;
            try
            {
                expectedFullPath = Path.GetFullPath(expectedExecutablePath);
            }
            catch
            {
                return ProcessIdentityStatus.Unknown;
            }

            try
            {
                using (Process process = Process.GetProcessById(pid))
                {
                    string actualPath = null;
                    try
                    {
                        ProcessModule module = process.MainModule;
                        if (module != null)
                        {
                            actualPath = module.FileName;
                        }
                    }
                    catch
                    {
                        return ProcessIdentityStatus.Unknown;
                    }

                    if (string.IsNullOrWhiteSpace(actualPath))
                    {
                        return ProcessIdentityStatus.Unknown;
                    }

                    string actualFullPath;
                    try
                    {
                        actualFullPath = Path.GetFullPath(actualPath);
                    }
                    catch
                    {
                        return ProcessIdentityStatus.Unknown;
                    }

                    if (string.Equals(actualFullPath, expectedFullPath, StringComparison.OrdinalIgnoreCase))
                    {
                        return ProcessIdentityStatus.Match;
                    }

                    return ProcessIdentityStatus.Mismatch;
                }
            }
            catch
            {
                return ProcessIdentityStatus.Unknown;
            }
        }

        private enum ProcessIdentityStatus
        {
            Unknown = 0,
            Match = 1,
            Mismatch = 2,
        }
    }
}
