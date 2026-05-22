using System;
using System.IO;
using Arma3ServerTools.Application.Services;
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
            var checker = new ServerPreflightChecker();
            var config = new ArmaServerConfig
            {
                ServerDir = string.Empty,
                ServerUUID = "uuid-test",
            };

            var items = checker.Check(config, ServerRunState.Stopped);

            Assert.True(checker.HasBlockingErrors(items));
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
                    StartupParameters = new StartupParameters { Port = 2302 },
                    ServerConfig = new ServerConfig { HostName = "Test Server" },
                };

                var checker = new ServerPreflightChecker();
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
            var checker = new ServerPreflightChecker();
            var config = new ArmaServerConfig
            {
                ServerDir = @"C:\测试\arma3",
                ServerUUID = "uuid-test",
            };

            var items = checker.Check(config, ServerRunState.Stopped);

            Assert.True(checker.HasBlockingErrors(items));
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
    }
}
