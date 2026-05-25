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
                tracker.Capture(serverUuid, config);
                tracker.Remove(serverUuid);
            }

            AssertSnapshotCounts(tracker, expectedPersisted: 0, expectedApplied: 0);
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
                tracker.Capture(serverUuid, config);
            }

            AssertSnapshotCounts(tracker, expectedPersisted: 1, expectedApplied: 1);

            tracker.Clear();
            AssertSnapshotCounts(tracker, expectedPersisted: 0, expectedApplied: 0);
        }

        [Fact]
        public void SnapshotTracker_RemoveAndClear_AreIdempotent()
        {
            var tracker = new ServerConfigSnapshotTracker();
            tracker.Capture("idempotent", CreateConfig("idempotent"));

            tracker.Remove("idempotent");
            tracker.Remove("idempotent");
            tracker.Clear();
            tracker.Clear();

            AssertSnapshotCounts(tracker, expectedPersisted: 0, expectedApplied: 0);
        }

        private static void AssertSnapshotCounts(
            ServerConfigSnapshotTracker tracker,
            int expectedPersisted,
            int expectedApplied)
        {
            Type trackerType = typeof(ServerConfigSnapshotTracker);
            var persisted = (Dictionary<string, string>)trackerType
                .GetField("persistedSnapshots", BindingFlags.NonPublic | BindingFlags.Instance)
                .GetValue(tracker);
            var applied = (Dictionary<string, string>)trackerType
                .GetField("serverAppliedSnapshots", BindingFlags.NonPublic | BindingFlags.Instance)
                .GetValue(tracker);

            Assert.Equal(expectedPersisted, persisted.Count);
            Assert.Equal(expectedApplied, applied.Count);
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
