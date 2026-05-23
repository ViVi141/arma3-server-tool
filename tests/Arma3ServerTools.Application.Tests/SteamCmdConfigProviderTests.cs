using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.Core.Models;
using Arma3ServerTools.Core.Repositories;
using Arma3ServerTools.TestSupport;
using System;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class SteamCmdConfigProviderTests
    {
        [Fact]
        public void GetSettings_ExternalRepositoryUpdate_ReturnsLatestSettings()
        {
            if (!OperatingSystem.IsWindows())
            {
                return;
            }

            string root = AutomatedTestWorkspace.CreateRoot("a3-steamcfg-provider");
            try
            {
                var paths = new AppPaths(root);
                var repository = new SteamCmdConfigRepository(paths);
                var provider = new SteamCmdConfigProvider(paths, repository);

                repository.Save(new SteamcmdEntity
                {
                    u = "user-a",
                    p = "pass-a",
                });

                SteamcmdEntity firstRead = provider.GetSettings();
                Assert.Equal("user-a", firstRead.u);

                repository.Save(new SteamcmdEntity
                {
                    u = "user-b",
                    p = "pass-b",
                });

                SteamcmdEntity secondRead = provider.GetSettings();
                Assert.Equal("user-b", secondRead.u);
                Assert.Equal("pass-b", secondRead.p);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }
}
