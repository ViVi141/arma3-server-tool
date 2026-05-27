using System;
using System.IO;
using System.Text;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class ServerPreflightCheckerTests
    {
        [Fact]
        public void Check_MissingServerDir_ReturnsBlockingError()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3preflight-missing");
            try
            {
                var checker = new ServerPreflightChecker(new MonitoringDeploymentService(new Core.AppPaths(root)));
                var config = new ArmaServerConfig
                {
                    ServerDir = string.Empty,
                    ServerUUID = "uuid-test",
                };

                var items = checker.Check(config, ServerRunState.Stopped);

                Assert.True(checker.HasBlockingErrors(items));
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void Check_ValidFakeServer_ReturnsNoBlockingErrors()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3preflight");
            try
            {
                string serverDir = Path.Combine(root, "server");
                AutomatedTestWorkspace.CreateFakeDedicatedServer(serverDir);

                var config = new ArmaServerConfig
                {
                    ServerDir = serverDir,
                    ServerUUID = "uuid-test",
                    x64 = true,
                    StartupParameters = new StartupParameters { Port = AutomatedTestWorkspace.FindAvailableUdpPort() },
                    ServerConfig = new ServerConfig { HostName = "Test Server" },
                };

                var checker = new ServerPreflightChecker(new MonitoringDeploymentService(new Core.AppPaths(root)));
                var items = checker.Check(config, ServerRunState.Stopped);

                Assert.False(checker.HasBlockingErrors(items));
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void Check_ChinesePath_ReturnsBlockingError()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3preflight-cn");
            try
            {
                var checker = new ServerPreflightChecker(new MonitoringDeploymentService(new Core.AppPaths(root)));
                var config = new ArmaServerConfig
                {
                    ServerDir = @"C:\测试\arma3",
                    ServerUUID = "uuid-test",
                };

                var items = checker.Check(config, ServerRunState.Stopped);

                Assert.True(checker.HasBlockingErrors(items));
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void Check_EmptyRConPasswordWithBattlEye_ReturnsWarning()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3preflight-rcon");
            try
            {
                string serverDir = Path.Combine(root, "server");
                AutomatedTestWorkspace.CreateFakeDedicatedServer(serverDir);

                var config = new ArmaServerConfig
                {
                    ServerDir = serverDir,
                    ServerUUID = "uuid-test",
                    x64 = true,
                    StartupParameters = new StartupParameters { Port = AutomatedTestWorkspace.FindAvailableUdpPort() },
                    ServerConfig = new ServerConfig { HostName = "Test Server", BattlEye = true },
                    BattlEyeConfig = new BattlEye { RConPassword = string.Empty },
                };

                var checker = new ServerPreflightChecker(new MonitoringDeploymentService(new Core.AppPaths(root)));
                var items = checker.Check(config, ServerRunState.Stopped);

                Assert.False(checker.HasBlockingErrors(items));
                Assert.True(checker.HasBlockingWarnings(items));
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }

    public class RptLogServiceTests
    {
        [Fact]
        public void FindLatestRptPath_PicksNewestFile()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3rpt-find");
            try
            {
                string serverDir = Path.Combine(root, "server");
                Directory.CreateDirectory(serverDir);
                string older = Path.Combine(serverDir, "older.rpt");
                string newer = Path.Combine(serverDir, "newer.rpt");
                File.WriteAllText(older, "old");
                File.WriteAllText(newer, "new");
                File.SetLastWriteTimeUtc(older, DateTime.UtcNow.AddHours(-2));
                File.SetLastWriteTimeUtc(newer, DateTime.UtcNow);

                var config = new ArmaServerConfig
                {
                    ServerDir = serverDir,
                    ServerUUID = "uuid-rpt",
                };

                var service = new RptLogService();
                string path = service.FindLatestRptPath(config);

                Assert.Equal(newer, path);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void ReadTail_ReturnsLastLinesOnly()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3rpt-tail");
            try
            {
                string filePath = Path.Combine(root, "sample.rpt");
                File.WriteAllLines(filePath, new[] { "line1", "line2", "line3", "line4", "line5" });

                var service = new RptLogService();
                string tail = service.ReadTail(filePath, 2);

                Assert.Contains("line4", tail);
                Assert.Contains("line5", tail);
                Assert.DoesNotContain("line1", tail);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void ListLogFiles_IncludesRptAndBattlEye()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3rpt-list");
            try
            {
                string serverDir = Path.Combine(root, "server");
                Directory.CreateDirectory(serverDir);
                string rptPath = Path.Combine(serverDir, "arma.rpt");
                File.WriteAllText(rptPath, "rpt");
                string beDir = Path.Combine(serverDir, "BattlEye");
                Directory.CreateDirectory(beDir);
                string beLog = Path.Combine(beDir, "server.log");
                File.WriteAllText(beLog, "be");

                var config = new ArmaServerConfig
                {
                    ServerDir = serverDir,
                    ServerUUID = "uuid-list",
                };

                var service = new RptLogService();
                var all = service.ListLogFiles(config, GameLogKinds.All);
                Assert.True(all.Count >= 2);
                Assert.Contains(all, entry => entry.Kind == GameLogKinds.Rpt);
                Assert.Contains(all, entry => entry.Kind == GameLogKinds.BattlEye);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void ReadGameLog_RejectsPathTraversalFileName()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3rpt-traversal");
            try
            {
                string serverDir = Path.Combine(root, "server");
                Directory.CreateDirectory(serverDir);
                File.WriteAllText(Path.Combine(serverDir, "safe.rpt"), "ok");

                var config = new ArmaServerConfig
                {
                    ServerDir = serverDir,
                    ServerUUID = "uuid-trav",
                };

                var service = new RptLogService();
                GameLogReadResult result = service.ReadGameLog(config, GameLogKinds.Rpt, 50, "..\\safe.rpt");
                Assert.False(result.Found);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void ReadDelta_ReturnsOnlyAppendedText()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3rpt-delta");
            try
            {
                string filePath = Path.Combine(root, "delta.rpt");
                File.WriteAllText(filePath, "line1" + Environment.NewLine + "line2" + Environment.NewLine, Encoding.UTF8);

                var service = new RptLogService();
                long position = 0;
                string first = service.ReadDelta(filePath, ref position);
                Assert.Contains("line1", first);
                Assert.Contains("line2", first);

                File.AppendAllText(filePath, "line3" + Environment.NewLine, Encoding.UTF8);
                string second = service.ReadDelta(filePath, ref position);
                Assert.Contains("line3", second);
                Assert.DoesNotContain("line1", second);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }

}
