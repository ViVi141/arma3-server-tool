using System.Collections.Generic;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core.Config;
using Arma3ServerTools.Core.Models;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class ArmaServerConfigJsonMergeTests
    {
        [Fact]
        public void Merge_PatchesNestedFieldWithoutDroppingSiblings()
        {
            var existing = new ArmaServerConfig
            {
                ServerUUID = "uuid-merge",
                ConfigName = "Test Server",
                ServerConfig = new ServerConfig
                {
                    HostName = "Old Name",
                    MaxPlayers = 20,
                },
            };

            ArmaServerConfig merged = ArmaServerConfigJsonMerge.Merge(
                existing,
                @"{ ""ServerConfig"": { ""HostName"": ""New Name"" } }");

            Assert.Equal("New Name", merged.ServerConfig.HostName);
            Assert.Equal(20, merged.ServerConfig.MaxPlayers);
            Assert.Equal("uuid-merge", merged.ServerUUID);
            Assert.Equal("Test Server", merged.ConfigName);
        }

        [Fact]
        public void Merge_ReplacesArrayWhenPatchIncludesIt()
        {
            var existing = new ArmaServerConfig
            {
                StartupParameters = new StartupParameters
                {
                    modsEntities = new List<ModsEntity>
                    {
                        new ModsEntity("a", "a", "A", 1, false, true, false, false),
                    },
                },
            };

            ArmaServerConfig merged = ArmaServerConfigJsonMerge.Merge(
                existing,
                @"{ ""StartupParameters"": { ""modsEntities"": [] } }");

            Assert.Empty(merged.StartupParameters.modsEntities);
        }
    }

    public sealed class ModDisableServiceTests
    {
        [Fact]
        public void DisableModsByModIds_ServerTarget_ClearsServerModOnly()
        {
            var config = new ArmaServerConfig
            {
                StartupParameters = new StartupParameters
                {
                    modsEntities = new List<ModsEntity>
                    {
                        new ModsEntity("a", "cba", "CBA", 450814997, true, true, false, false),
                    },
                },
            };
            var service = new ModEnablerService();

            ModDisableApplyResult result = service.DisableModsByModIds(
                config,
                new List<ulong> { 450814997UL },
                ModApplyTarget.Server);

            Assert.Equal(1, result.DisabledCount);
            Assert.Empty(result.NotFoundModIds);
            Assert.True(config.StartupParameters.modsEntities[0].LocalMod);
            Assert.False(config.StartupParameters.modsEntities[0].ServerMod);
        }

        [Fact]
        public void DisableModsByModIds_UnknownModId_ReportsNotFound()
        {
            var config = new ArmaServerConfig { StartupParameters = new StartupParameters() };
            var service = new ModEnablerService();

            ModDisableApplyResult result = service.DisableModsByModIds(
                config,
                new List<ulong> { 999999999UL },
                ModApplyTarget.Server);

            Assert.Equal(0, result.DisabledCount);
            Assert.Single(result.NotFoundModIds);
        }
    }
}
