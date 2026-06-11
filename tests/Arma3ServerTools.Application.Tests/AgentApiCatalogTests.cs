using System.Linq;
using Arma3ServerTools.Application.Automation;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class AgentApiCatalogTests
    {
        [Fact]
        public void Build_ReturnsAllTaskActions()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.NotNull(data.TaskActions);
            Assert.NotEmpty(data.TaskActions);
        }

        [Fact]
        public void Build_ContainsStartAction()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.Contains(data.TaskActions, a => a.Name == "start");
        }

        [Fact]
        public void Build_ContainsStopAction()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.Contains(data.TaskActions, a => a.Name == "stop");
        }

        [Fact]
        public void Build_ContainsStatusAction()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.Contains(data.TaskActions, a => a.Name == "status");
        }

        [Fact]
        public void Build_ContainsWriteCfgAction()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.Contains(data.TaskActions, a => a.Name == "write_cfg");
        }

        [Fact]
        public void Build_ContainsDownloadModsAction()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.Contains(data.TaskActions, a => a.Name == "download_mods");
        }

        [Fact]
        public void Build_ContainsSwitchMissionAction()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.Contains(data.TaskActions, a => a.Name == "switch_mission");
        }

        [Fact]
        public void Build_ContainsDisableModsAction()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.Contains(data.TaskActions, a => a.Name == "disable_mods");
        }

        [Fact]
        public void Build_ContainsPatchConfigEndpoint()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.Contains(
                data.RestEndpoints,
                e => e.Method == "PATCH" && e.Path == "/api/v1/servers/{uuid}/config");
        }

        [Fact]
        public void Build_ReturnsRestEndpoints()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.NotNull(data.RestEndpoints);
            Assert.NotEmpty(data.RestEndpoints);
            Assert.Contains(data.RestEndpoints, e => e.Path.Contains("/api/v1/servers"));
        }

        [Fact]
        public void Build_ReturnsHealthEndpoint()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.Contains(data.RestEndpoints, e =>
                e.Path == "/api/v1/health" && e.Method == "GET");
        }

        [Fact]
        public void Build_ReturnsActionsEndpoint()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.Contains(data.RestEndpoints, e =>
                e.Path == "/api/v1/actions" && e.Method == "GET");
        }

        [Fact]
        public void Build_ReturnsFileUploads()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.NotNull(data.FileUploads);
            Assert.NotEmpty(data.FileUploads);
        }

        [Fact]
        public void Build_AllActionsHaveSummary()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.All(data.TaskActions, a => Assert.False(string.IsNullOrWhiteSpace(a.Summary)));
        }

        [Fact]
        public void Build_AllRestEndpointsHaveMethod()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            Assert.All(data.RestEndpoints, e => Assert.False(string.IsNullOrWhiteSpace(e.Method)));
            Assert.All(data.RestEndpoints, e => Assert.False(string.IsNullOrWhiteSpace(e.Path)));
        }

        [Fact]
        public void Build_NoLegacyTaskActionsPresent()
        {
            AgentApiCatalogData data = AgentApiCatalog.Build();

            string[] legacyNames = { "list_details", "get_config", "config_set", "read_config" };
            foreach (string legacy in legacyNames)
            {
                Assert.DoesNotContain(data.TaskActions, a => a.Name == legacy);
            }
        }
    }
}
