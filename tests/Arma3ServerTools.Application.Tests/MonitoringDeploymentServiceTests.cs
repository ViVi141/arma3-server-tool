using System;
using System.IO;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class MonitoringDeploymentServiceTests
    {
        [Fact]
        public void DeployIfEnabled_WhenDisabled_DoesNothing()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3monitor-skip");
            try
            {
                string serverDir = Path.Combine(root, "server");
                Directory.CreateDirectory(serverDir);
                var service = new MonitoringDeploymentService(new AppPaths(root));
                var config = new ArmaServerConfig
                {
                    ServerDir = serverDir,
                    ServerUUID = "uuid-skip",
                    ServerTaskManagement = new ServerManagement { EnableMonitor = false },
                };

                OperationResult result = service.DeployIfEnabled(config);

                Assert.True(result.Success, result.Message);
                Assert.False(File.Exists(Path.Combine(serverDir, ToolConstants.MonitoringExtensionDllFileName)));
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void DeployIfEnabled_CopiesDllAndModAndWritesInitScript()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3monitor-deploy");
            try
            {
                AutomatedTestWorkspace.CreateBundledMonitoringAssets(root);
                string serverDir = Path.Combine(root, "server");
                Directory.CreateDirectory(serverDir);
                var service = new MonitoringDeploymentService(new AppPaths(root));
                var config = new ArmaServerConfig
                {
                    ServerDir = serverDir,
                    ServerUUID = "uuid-deploy-test",
                    ServerConfig = new ServerConfig { ServerCommandPassword = "cmd-pass" },
                    ServerTaskManagement = new ServerManagement
                    {
                        EnableMonitor = true,
                        EnableMonitoringService = true,
                        RestartTime = 2,
                        RestartInfo = "即将重启",
                        RestartLastTime = 30,
                    },
                };

                OperationResult result = service.DeployIfEnabled(config);

                Assert.True(result.Success, result.Message);
                Assert.True(File.Exists(Path.Combine(serverDir, ToolConstants.MonitoringExtensionDllFileName)));
                Assert.True(Directory.Exists(Path.Combine(serverDir, ToolConstants.MonitoringServerModToken)));

                string initScriptPath = Path.Combine(
                    serverDir,
                    ToolConstants.MonitoringServerModToken,
                    "addons",
                    "a3st_monitor",
                    "fn_initFunctions.sqf");
                string initScript = File.ReadAllText(initScriptPath);
                Assert.Contains("uuid-deploy-test", initScript);
                Assert.Contains("destiny_var_enableStatistics = true", initScript);
                Assert.Contains("cmd-pass", initScript);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void BuildInitFunctionsScript_UsesFalseWhenMonitoringServiceDisabled()
        {
            var config = new ArmaServerConfig
            {
                ServerUUID = "uuid-off",
                ServerTaskManagement = new ServerManagement { EnableMonitoringService = false },
            };

            string script = MonitoringDeploymentService.BuildInitFunctionsScript(config);

            Assert.Contains("destiny_var_enableStatistics = false", script);
        }

        [Fact]
        public void DeployIfEnabled_SecondRun_SkipsUnchangedFiles()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3monitor-incremental");
            try
            {
                AutomatedTestWorkspace.CreateBundledMonitoringAssets(root);
                string serverDir = Path.Combine(root, "server");
                Directory.CreateDirectory(serverDir);
                var service = new MonitoringDeploymentService(new AppPaths(root));
                var config = new ArmaServerConfig
                {
                    ServerDir = serverDir,
                    ServerUUID = "uuid-incremental",
                    ServerConfig = new ServerConfig { ServerCommandPassword = "cmd-pass" },
                    ServerTaskManagement = new ServerManagement
                    {
                        EnableMonitor = true,
                        EnableMonitoringService = true,
                    },
                };

                Assert.True(service.DeployIfEnabled(config).Success);
                string dllPath = Path.Combine(serverDir, ToolConstants.MonitoringExtensionDllFileName);
                DateTime firstWriteUtc = File.GetLastWriteTimeUtc(dllPath);

                System.Threading.Thread.Sleep(50);

                Assert.True(service.DeployIfEnabled(config).Success);
                DateTime secondWriteUtc = File.GetLastWriteTimeUtc(dllPath);
                Assert.Equal(firstWriteUtc, secondWriteUtc);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }
}
