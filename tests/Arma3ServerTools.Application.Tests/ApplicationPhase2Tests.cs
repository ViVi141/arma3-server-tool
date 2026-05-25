using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Application.ProcessManagement;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class FakeProcessRunner : IProcessRunner
    {
        public int LastProcessId { get; private set; } = 4242;

        public string LastFileName { get; private set; }

        public string LastArguments { get; private set; }

        public string LastWorkingDirectory { get; private set; }

        public bool ShouldFailStart { get; set; }

        public HashSet<int> RunningProcesses { get; } = new HashSet<int>();

        public ProcessStartResult Start(string fileName, string arguments, string workingDirectory = null)
        {
            LastFileName = fileName;
            LastArguments = arguments;
            LastWorkingDirectory = workingDirectory;
            if (ShouldFailStart)
            {
                return ProcessStartResult.Fail("mock start failed");
            }

            RunningProcesses.Add(LastProcessId);
            return ProcessStartResult.Ok(LastProcessId);
        }

        public bool TryKill(int processId)
        {
            return RunningProcesses.Remove(processId);
        }

        public bool IsRunning(int processId)
        {
            return RunningProcesses.Contains(processId);
        }
    }

    public class ServerProcessServiceTests
    {
        [Fact]
        public void Start_WritesConfigAndStartsProcess()
        {
            string root = CreateTempRoot();
            try
            {
                SetupServerLayout(root, "proc-test");
                var paths = new AppPaths(root);
                var repository = new ServerConfigRepository(paths);
                var configService = new ServerConfigService(repository);
                ArmaServerConfig config = configService.Create("ProcTest", Path.Combine(root, "server"));
                config.StartupParameters.Port = 2502;
                configService.Save(config);

                var runner = new FakeProcessRunner();
                var monitoringDeployment = new MonitoringDeploymentService(paths);
                var processService = new ServerProcessService(
                    configService,
                    new GameConfigWriterAdapter(),
                    runner,
                    monitoringDeployment);

                OperationResult result = processService.Start(config.ServerUUID);
                Assert.True(result.Success, result.Message);
                Assert.Contains("2502", runner.LastArguments);
                Assert.Equal(config.ServerDir, runner.LastWorkingDirectory);
                Assert.Equal(ServerRunState.Running, processService.GetState(config.ServerUUID));

                OperationResult stopResult = processService.Stop(config.ServerUUID);
                Assert.True(stopResult.Success, stopResult.Message);
                Assert.Equal(ServerRunState.Stopped, processService.GetState(config.ServerUUID));
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void SyncState_StaleProcessId_ClearsPidAndReturnsStopped()
        {
            string root = CreateTempRoot();
            try
            {
                SetupServerLayout(root, "stale-pid");
                var paths = new AppPaths(root);
                var repository = new ServerConfigRepository(paths);
                var configService = new ServerConfigService(repository);
                ArmaServerConfig config = configService.Create("StalePid", Path.Combine(root, "server"));
                configService.Save(config);

                var runner = new FakeProcessRunner();
                var monitoringDeployment = new MonitoringDeploymentService(paths);
                var processService = new ServerProcessService(
                    configService,
                    new GameConfigWriterAdapter(),
                    runner,
                    monitoringDeployment);

                OperationResult startResult = processService.Start(config.ServerUUID);
                Assert.True(startResult.Success, startResult.Message);
                Assert.Equal(ServerRunState.Running, processService.GetState(config.ServerUUID));

                runner.RunningProcesses.Remove(runner.LastProcessId);
                ServerRunState syncedState = processService.SyncState(config.ServerUUID);
                Assert.Equal(ServerRunState.Stopped, syncedState);
                Assert.Equal(ServerRunState.Stopped, processService.GetState(config.ServerUUID));

                ArmaServerConfig reloaded = configService.Get(config.ServerUUID);
                Assert.Equal(0, reloaded.ServerTaskManagement.ProcessById);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void Stop_AlreadyExitedProcess_ClearsPidAndSucceeds()
        {
            string root = CreateTempRoot();
            try
            {
                SetupServerLayout(root, "dead-stop");
                var paths = new AppPaths(root);
                var repository = new ServerConfigRepository(paths);
                var configService = new ServerConfigService(repository);
                ArmaServerConfig config = configService.Create("DeadStop", Path.Combine(root, "server"));

                var runner = new FakeProcessRunner();
                var monitoringDeployment = new MonitoringDeploymentService(paths);
                var processService = new ServerProcessService(
                    configService,
                    new GameConfigWriterAdapter(),
                    runner,
                    monitoringDeployment);

                OperationResult startResult = processService.Start(config.ServerUUID);
                Assert.True(startResult.Success, startResult.Message);
                runner.RunningProcesses.Remove(runner.LastProcessId);

                OperationResult stopResult = processService.Stop(config.ServerUUID);
                Assert.True(stopResult.Success, stopResult.Message);
                Assert.Equal(0, configService.Get(config.ServerUUID).ServerTaskManagement.ProcessById);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void Start_MissingExecutable_ReturnsFailure()
        {
            string root = CreateTempRoot();
            try
            {
                var paths = new AppPaths(root);
                var configService = new ServerConfigService(new ServerConfigRepository(paths));
                ArmaServerConfig config = configService.Create("MissingExe", Path.Combine(root, "missing-server"));
                var processService = new ServerProcessService(
                    configService,
                    new GameConfigWriterAdapter(),
                    new FakeProcessRunner(),
                    new MonitoringDeploymentService(paths));

                OperationResult result = processService.Start(config.ServerUUID);
                Assert.False(result.Success);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void StartHeadlessClient_StartsClientWithoutPersistingPid()
        {
            string root = CreateTempRoot();
            try
            {
                SetupServerLayout(root, "headless");
                var paths = new AppPaths(root);
                var configService = new ServerConfigService(new ServerConfigRepository(paths));
                ArmaServerConfig config = configService.Create("Headless", Path.Combine(root, "server"));
                config.StartupParameters.Port = 2302;
                config.ServerConfig.Password = "secret";
                configService.Save(config);

                var runner = new FakeProcessRunner();
                var monitoringDeployment = new MonitoringDeploymentService(paths);
                var processService = new ServerProcessService(
                    configService,
                    new GameConfigWriterAdapter(),
                    runner,
                    monitoringDeployment);

                OperationResult result = processService.StartHeadlessClient(config.ServerUUID);
                Assert.True(result.Success, result.Message);
                Assert.Contains("-client", runner.LastArguments);
                Assert.Contains("-connect=127.0.0.1:2302", runner.LastArguments);
                Assert.Equal(0, configService.Get(config.ServerUUID).ServerTaskManagement.ProcessById);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void DetectRestart_WhenRunning_DoesNotStartAgain()
        {
            string root = CreateTempRoot();
            try
            {
                SetupServerLayout(root, "detect-running");
                var paths = new AppPaths(root);
                var configService = new ServerConfigService(new ServerConfigRepository(paths));
                ArmaServerConfig config = configService.Create("DetectRunning", Path.Combine(root, "server"));
                var runner = new FakeProcessRunner();
                var monitoringDeployment = new MonitoringDeploymentService(paths);
                var processService = new ServerProcessService(
                    configService,
                    new GameConfigWriterAdapter(),
                    runner,
                    monitoringDeployment);

                OperationResult startResult = processService.Start(config.ServerUUID);
                Assert.True(startResult.Success, startResult.Message);
                int pidBefore = configService.Get(config.ServerUUID).ServerTaskManagement.ProcessById;

                OperationResult detectResult = processService.DetectRestart(config.ServerUUID);
                Assert.True(detectResult.Success, detectResult.Message);
                Assert.Equal(pidBefore, configService.Get(config.ServerUUID).ServerTaskManagement.ProcessById);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void DetectRestart_WhenStopped_StartsServer()
        {
            string root = CreateTempRoot();
            try
            {
                SetupServerLayout(root, "detect-stopped");
                var paths = new AppPaths(root);
                var configService = new ServerConfigService(new ServerConfigRepository(paths));
                ArmaServerConfig config = configService.Create("DetectStopped", Path.Combine(root, "server"));
                var runner = new FakeProcessRunner();
                var monitoringDeployment = new MonitoringDeploymentService(paths);
                var processService = new ServerProcessService(
                    configService,
                    new GameConfigWriterAdapter(),
                    runner,
                    monitoringDeployment);

                OperationResult detectResult = processService.DetectRestart(config.ServerUUID);
                Assert.True(detectResult.Success, detectResult.Message);
                Assert.Equal(ServerRunState.Running, processService.GetState(config.ServerUUID));
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        private static void SetupServerLayout(string root, string name)
        {
            string serverDir = Path.Combine(root, "server");
            Directory.CreateDirectory(serverDir);
            File.WriteAllText(Path.Combine(serverDir, "arma3server_x64.exe"), string.Empty);
        }

        private static string CreateTempRoot()
        {
            string path = Path.Combine(Path.GetTempPath(), "a3app-test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(path);
            Directory.CreateDirectory(Path.Combine(path, "config"));
            AutomatedTestWorkspace.CopySqlSchema(path);
            return path;
        }

        private static void DeleteDirectory(string path)
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
        }
    }

    public class SteamCmdServiceTests
    {
        [Fact]
        public void InstallDedicatedServer_MissingSteamCmd_ReturnsFailure()
        {
            string root = CreateTempRoot();
            try
            {
                var service = new SteamCmdService(
                    new AppPaths(root),
                    new InlineSteamCmdConfig(new SteamcmdEntity { u = "user", p = "pass" }),
                    new FakeProcessRunner());

                OperationResult result = service.InstallDedicatedServer(@"D:\arma");
                Assert.False(result.Success);
                Assert.Contains("steamcmd.exe", result.Message);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void InstallDedicatedServer_WithSteamCmd_StartsProcess()
        {
            string root = CreateTempRoot();
            try
            {
                Directory.CreateDirectory(Path.Combine(root, "extension"));
                AutomatedTestWorkspace.CreateCompleteSteamCmdInstall(Path.Combine(root, "extension"));
                var runner = new FakeProcessRunner();
                var service = new SteamCmdService(
                    new AppPaths(root),
                    new InlineSteamCmdConfig(new SteamcmdEntity { u = "user", p = "pass" }),
                    runner);

                OperationResult result = service.InstallDedicatedServer(@"D:\arma");
                Assert.True(result.Success, result.Message);
                Assert.Contains("233780", runner.LastArguments);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void InstallDedicatedServer_MissingAccount_ReturnsFailure()
        {
            string root = CreateTempRoot();
            try
            {
                AutomatedTestWorkspace.CreateBundledSteamCmd(root);
                var service = new SteamCmdService(
                    new AppPaths(root),
                    new InlineSteamCmdConfig(new SteamcmdEntity()),
                    new FakeProcessRunner());

                OperationResult result = service.InstallDedicatedServer(@"D:\arma");
                Assert.False(result.Success);
                Assert.Contains("账号", result.Message);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void EnsureSteamCmdAvailable_WorkshopPath_Succeeds()
        {
            string root = CreateTempRoot();
            try
            {
                string workshopRoot = Path.Combine(root, "workshop");
                AutomatedTestWorkspace.CreateCompleteSteamCmdInstall(workshopRoot);

                var service = new SteamCmdService(
                    new AppPaths(root),
                    new InlineSteamCmdConfig(new SteamcmdEntity { d = workshopRoot }),
                    new FakeProcessRunner());

                OperationResult result = service.EnsureSteamCmdAvailable(false);
                Assert.True(result.Success, result.Message);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void DownloadWorkshopItems_MissingSteamCmd_ReturnsFailure()
        {
            string root = CreateTempRoot();
            try
            {
                var service = new SteamCmdService(
                    new AppPaths(root),
                    new InlineSteamCmdConfig(new SteamcmdEntity { u = "user", p = "pass", d = root }),
                    new FakeProcessRunner());

                OperationResult result = service.DownloadWorkshopItems(new ulong[] { 123456789 });
                Assert.False(result.Success);
                Assert.Contains("steamcmd.exe", result.Message);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void DownloadWorkshopItems_WithSteamCmd_StartsProcess()
        {
            string root = CreateTempRoot();
            try
            {
                string workshopRoot = Path.Combine(root, "workshop");
                AutomatedTestWorkspace.CreateCompleteSteamCmdInstall(workshopRoot);
                var runner = new FakeProcessRunner();
                var service = new SteamCmdService(
                    new AppPaths(root),
                    new InlineSteamCmdConfig(new SteamcmdEntity { u = "user", p = "pass", d = workshopRoot }),
                    runner);

                OperationResult result = service.DownloadWorkshopItems(new ulong[] { 111111111, 222222222 });
                Assert.True(result.Success, result.Message);
                Assert.Contains("workshop_download_item 107410 111111111", runner.LastArguments);
                Assert.Contains("workshop_download_item 107410 222222222", runner.LastArguments);
                Assert.Contains("+quit", runner.LastArguments);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        [Fact]
        public void DownloadWorkshopItems_MissingAccount_ReturnsFailure()
        {
            string root = CreateTempRoot();
            try
            {
                AutomatedTestWorkspace.CreateBundledSteamCmd(root);
                var service = new SteamCmdService(
                    new AppPaths(root),
                    new InlineSteamCmdConfig(new SteamcmdEntity { d = root }),
                    new FakeProcessRunner());

                OperationResult result = service.DownloadWorkshopItems(new ulong[] { 123456789 });
                Assert.False(result.Success);
                Assert.Contains("账号", result.Message);
            }
            finally
            {
                DeleteDirectory(root);
            }
        }

        private static string CreateTempRoot()
        {
            string path = Path.Combine(Path.GetTempPath(), "a3steam-test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(path);
            return path;
        }

        private static void DeleteDirectory(string path)
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
        }
    }

    internal sealed class InlineSteamCmdConfig : ISteamCmdConfigProvider
    {
        private readonly SteamcmdEntity settings;

        public InlineSteamCmdConfig(SteamcmdEntity settings)
        {
            this.settings = settings;
        }

        public SteamcmdEntity GetSettings()
        {
            return settings;
        }

        public void SaveSettings(SteamcmdEntity entity)
        {
        }

        public string LastLoadWarning
        {
            get { return null; }
        }
    }
}
