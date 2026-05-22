using System.Threading;
using Arma3ServerTools.Application.Monitoring;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class QueuedMonitoringIngestServiceTests
    {
        [Fact]
        public void Ingest_QueuedMessage_PersistsPlayerRow()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mon-queue");
            try
            {
                AutomatedTestWorkspace.CopySqlSchema(root);
                using (var database = new MonitoringDatabase(new AppPaths(root)))
                using (var queued = new QueuedMonitoringIngestService(database))
                {
                    queued.Ingest("PlayerInfo:server-queue:99:QueuedPlayer:0:0:0:0:0:10");
                    Thread.Sleep(500);

                    var query = new MonitoringQueryService(database);
                    var stats = query.GetPlayerStats("server-queue", 10);
                    Assert.Single(stats);
                    Assert.Equal("QueuedPlayer", stats[0].PlayerName);
                    Assert.Equal(10, stats[0].TotalScore);
                }
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void Ingest_EmptyMessage_IsIgnored()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3mon-queue-empty");
            try
            {
                AutomatedTestWorkspace.CopySqlSchema(root);
                using (var database = new MonitoringDatabase(new AppPaths(root)))
                using (var queued = new QueuedMonitoringIngestService(database))
                {
                    queued.Ingest(string.Empty);
                    queued.Ingest("   ");
                    Thread.Sleep(200);

                    var query = new MonitoringQueryService(database);
                    Assert.Empty(query.GetPlayerStats("server-empty", 10));
                }
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }
}
