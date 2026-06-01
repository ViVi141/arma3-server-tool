using System;
using System.Collections.Generic;
using System.Reflection;
using Arma3ServerTools.Application.Sync;
using Arma3ServerTools.Core.Models;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class MemoryLeakRegressionTests
    {
        [Fact]
        public void SnapshotTracker_CaptureRemoveManyServers_DoesNotRetainSnapshots()
        {
            var tracker = new ServerConfigSnapshotTracker();

            for (int i = 0; i < 500; i++)
            {
                string serverUuid = "server-" + i.ToString("D4");
                ArmaServerConfig config = CreateConfig(serverUuid);
                tracker.CapturePersisted(serverUuid, config);
                tracker.Remove(serverUuid);
            }

            AssertPersistedCount(tracker, 0);
        }

        [Fact]
        public void SnapshotTracker_CaptureSameServerRepeatedly_UsesBoundedStorage()
        {
            var tracker = new ServerConfigSnapshotTracker();
            string serverUuid = "stable-server";

            for (int i = 0; i < 200; i++)
            {
                ArmaServerConfig config = CreateConfig(serverUuid);
                config.ServerConfig.HostName = "Host-" + i.ToString("D3");
                tracker.CapturePersisted(serverUuid, config);
            }

            AssertPersistedCount(tracker, 1);

            tracker.Clear();
            AssertPersistedCount(tracker, 0);
        }

        [Fact]
        public void SnapshotTracker_RemoveAndClear_AreIdempotent()
        {
            var tracker = new ServerConfigSnapshotTracker();
            tracker.CapturePersisted("idempotent", CreateConfig("idempotent"));

            tracker.Remove("idempotent");
            tracker.Remove("idempotent");
            tracker.Clear();
            tracker.Clear();

            AssertPersistedCount(tracker, 0);
        }

        private static void AssertPersistedCount(ServerConfigSnapshotTracker tracker, int expectedPersisted)
        {
            Type trackerType = typeof(ServerConfigSnapshotTracker);
            var persisted = (Dictionary<string, string>)trackerType
                .GetField("persistedSnapshots", BindingFlags.NonPublic | BindingFlags.Instance)
                .GetValue(tracker);

            Assert.Equal(expectedPersisted, persisted.Count);
        }

        private static ArmaServerConfig CreateConfig(string serverUuid)
        {
            return new ArmaServerConfig
            {
                ServerUUID = serverUuid,
                ConfigName = "Test-" + serverUuid,
                ServerDir = @"C:\Arma3Server",
            };
        }
    }
}
