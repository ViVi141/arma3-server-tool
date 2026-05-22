using System;
using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Application.ProcessManagement;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class FakeProcessRunner : IProcessRunner
    {
        public int LastProcessId { get; private set; } = 4242;

        public string LastFileName { get; private set; }

        public string LastArguments { get; private set; }

        public bool ShouldFailStart { get; set; }

        public HashSet<int> RunningProcesses { get; } = new HashSet<int>();

        public ProcessStartResult Start(string fileName, string arguments)
        {
            LastFileName = fileName;
            LastArguments = arguments;
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
                var processService = new ServerProcessService(
                    configService,
                    new GameConfigWriterAdapter(),
                    runner);

                OperationResult result = processService.Start(config.ServerUUID);
                Assert.True(result.Success, result.Message);
                Assert.Contains("2502", runner.LastArguments);
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
                    new FakeProcessRunner());

                OperationResult result = processService.Start(config.ServerUUID);
                Assert.False(result.Success);
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
            string sqlSource = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "sql", "destiny_statistics.sql");
            if (!File.Exists(sqlSource))
            {
                sqlSource = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "sql", "destiny_statistics.sql"));
            }

            if (File.Exists(sqlSource))
            {
                string sqlDestDir = Path.Combine(path, "sql");
                Directory.CreateDirectory(sqlDestDir);
                File.Copy(sqlSource, Path.Combine(sqlDestDir, "destiny_statistics.sql"), true);
            }

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
                File.WriteAllText(Path.Combine(root, "extension", "steamcmd.exe"), string.Empty);
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
    }
}
