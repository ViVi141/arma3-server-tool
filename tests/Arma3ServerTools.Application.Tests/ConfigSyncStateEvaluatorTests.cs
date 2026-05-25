using Arma3ServerTools.Application.Sync;
using Arma3ServerTools.Core.Models;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class ConfigSyncStateEvaluatorTests
    {
        [Fact]
        public void Evaluate_ReturnsUnsaved_WhenPersistedSnapshotDiffers()
        {
            var tracker = new ServerConfigSnapshotTracker();
            var config = CreateConfig("server-a");
            config.ServerConfig.HostName = "Alpha";
            tracker.CapturePersisted(config.ServerUUID, config);

            config.ServerConfig.HostName = "Beta";

            ConfigSyncState state = ConfigSyncStateEvaluator.Evaluate(
                tracker,
                config.ServerUUID,
                config);

            Assert.Equal(ConfigSyncState.Unsaved, state);
        }

        [Fact]
        public void Evaluate_ReturnsSavedToToolOnly_WhenJsonMatchesButCfgNotApplied()
        {
            var tracker = new ServerConfigSnapshotTracker();
            var config = CreateConfig("server-b");
            tracker.CapturePersisted(config.ServerUUID, config);

            ConfigSyncState state = ConfigSyncStateEvaluator.Evaluate(
                tracker,
                config.ServerUUID,
                config);

            Assert.Equal(ConfigSyncState.SavedToToolOnly, state);
        }

        [Fact]
        public void Evaluate_ReturnsFullySynced_WhenPersistedAndAppliedMatch()
        {
            var tracker = new ServerConfigSnapshotTracker();
            var config = CreateConfig("server-c");
            tracker.Capture(config.ServerUUID, config);

            ConfigSyncState state = ConfigSyncStateEvaluator.Evaluate(
                tracker,
                config.ServerUUID,
                config);

            Assert.Equal(ConfigSyncState.FullySynced, state);
        }

        [Fact]
        public void HasServerCfgDrift_ReturnsTrue_WhenAppliedSnapshotMissing()
        {
            var tracker = new ServerConfigSnapshotTracker();
            var config = CreateConfig("server-d");
            tracker.CapturePersisted(config.ServerUUID, config);

            Assert.True(tracker.HasServerCfgDrift(config.ServerUUID, config));
        }

        private static ArmaServerConfig CreateConfig(string serverUuid)
        {
            return new ArmaServerConfig
            {
                ServerUUID = serverUuid,
                ConfigName = "Test",
                ServerDir = @"C:\Arma3Server",
            };
        }
    }
}
