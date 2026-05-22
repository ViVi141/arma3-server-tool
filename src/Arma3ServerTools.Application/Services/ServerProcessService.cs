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

        public ServerProcessService(
            IServerConfigService configService,
            IGameConfigWriter configWriter,
            IProcessRunner processRunner)
        {
            this.configService = configService;
            this.configWriter = configWriter;
            this.processRunner = processRunner;
        }

        public OperationResult Start(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            OperationResult writeResult = configWriter.WriteAll(config);
            if (!writeResult.Success)
            {
                return writeResult;
            }

            configWriter.BuildStartCommandLine(config);
            string executable = GetServerExecutablePath(config);
            if (!File.Exists(executable))
            {
                return OperationResult.Fail("找不到服务器可执行文件: " + executable);
            }

            ProcessStartResult startResult = processRunner.Start(executable, config.StartCommandLine);
            if (!startResult.Success)
            {
                return OperationResult.Fail("启动失败: " + startResult.Message);
            }

            config.ServerTaskManagement.ProcessById = startResult.ProcessId;
            configService.Save(config);
            return OperationResult.Ok();
        }

        public OperationResult Stop(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            int pid = config.ServerTaskManagement.ProcessById;
            if (pid <= 0)
            {
                return OperationResult.Fail("服务器未在运行或 PID 无效。");
            }

            if (processRunner.IsRunning(pid))
            {
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
            return ResolveState(config, clearStaleProcessId: false);
        }

        public ServerRunState SyncState(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            return ResolveState(config, clearStaleProcessId: true);
        }

        private ServerRunState ResolveState(ArmaServerConfig config, bool clearStaleProcessId)
        {
            int pid = config.ServerTaskManagement.ProcessById;
            if (pid <= 0)
            {
                return ServerRunState.Stopped;
            }

            if (processRunner.IsRunning(pid))
            {
                return ServerRunState.Running;
            }

            if (clearStaleProcessId)
            {
                config.ServerTaskManagement.ProcessById = 0;
                configService.Save(config);
            }

            return ServerRunState.Stopped;
        }

        public OperationResult StartHeadlessClient(string serverUuid)
        {
            ArmaServerConfig config = configService.Get(serverUuid);
            string args = configWriter.BuildHeadlessClientCommandLine(config);
            string executable = GetServerExecutablePath(config);
            if (!File.Exists(executable))
            {
                return OperationResult.Fail("找不到服务器可执行文件: " + executable);
            }

            ProcessStartResult startResult = processRunner.Start(executable, args);
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
    }
}
