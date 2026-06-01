using System.Collections.Generic;
using Arma3ServerTools.Application.Sync;
using Arma3ServerTools.Core.Models;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class ServerConfigCompareSnapshotTests
    {
        [Fact]
        public void Serialize_IgnoresVolatileFields()
        {
            var config = CreateConfig("volatile-test");
            config.SaveTime = "上次保存于:2026-01-01";
            config.ServerTaskManagement.ProcessById = 4242;

            string first = ServerConfigSnapshotTracker.SerializeForCompare(config);
            config.SaveTime = "changed";
            config.ServerTaskManagement.ProcessById = 99;

            string second = ServerConfigSnapshotTracker.SerializeForCompare(config);

            Assert.Equal(first, second);
        }

        [Fact]
        public void Serialize_DetectsModListChanges()
        {
            var config = CreateConfig("mods-test");
            config.StartupParameters.modsEntities = new List<ModsEntity>
            {
                new ModsEntity(@"D:\mods\@alpha", "@alpha", "Alpha", 1001, true, false, false, false),
            };

            string baseline = ServerConfigSnapshotTracker.SerializeForCompare(config);
            config.StartupParameters.modsEntities[0].LocalMod = false;

            string changed = ServerConfigSnapshotTracker.SerializeForCompare(config);

            Assert.NotEqual(baseline, changed);
        }

        [Fact]
        public void Serialize_IsStableForModOrder()
        {
            var config = CreateConfig("mods-order");
            config.StartupParameters.modsEntities = new List<ModsEntity>
            {
                new ModsEntity(@"D:\mods\@bravo", "@bravo", "Bravo", 1002, true, false, false, false),
                new ModsEntity(@"D:\mods\@alpha", "@alpha", "Alpha", 1001, false, true, false, false),
            };

            string forward = ServerConfigSnapshotTracker.SerializeForCompare(config);
            config.StartupParameters.modsEntities.Reverse();
            string reversed = ServerConfigSnapshotTracker.SerializeForCompare(config);

            Assert.Equal(forward, reversed);
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
