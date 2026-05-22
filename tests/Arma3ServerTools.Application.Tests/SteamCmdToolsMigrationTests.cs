using System.Collections.Generic;
using System.IO;
using Arma3ServerTools.Application.Services;
using Arma3ServerTools.Core;
using Arma3ServerTools.TestSupport;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class SteamWorkshopApiServiceTests
    {
        [Fact]
        public void ParseModDetails_ExtractsTitleAndId()
        {
            string json = "{ \"response\": { \"publishedfiledetails\": [ { "
                + "\"publishedfileid\": \"1234567890\", "
                + "\"creator_app_id\": 107410, "
                + "\"title\": \"CBA_A3\", "
                + "\"description\": \"test mod\", "
                + "\"file_size\": \"1048576\" } ] } }";

            List<SteamWorkshopModInfo> mods = SteamWorkshopApiService.ParseModDetails(
                json,
                new List<ulong> { 1234567890UL });

            Assert.Single(mods);
            Assert.Equal(1234567890UL, mods[0].ModId);
            Assert.Equal("CBA_A3", mods[0].Title);
            Assert.Contains("MB", mods[0].FileSizeMb);
        }
    }

    public class SteamCmdToolsDownloadServiceTests
    {
        [Fact]
        public void GetToolsExecutablePath_PointsToSteamcmdToolsFolder()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3tools-path");
            try
            {
                var service = new SteamCmdToolsDownloadService(new AppPaths(root));
                string expected = Path.Combine(root, "steamcmdTools", "steamcmdTools.exe");
                Assert.Equal(expected, service.GetToolsExecutablePath());
                Assert.False(service.IsToolsAvailable());
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }

        [Fact]
        public void DownloadMods_WithoutExecutable_ReturnsFailure()
        {
            string root = AutomatedTestWorkspace.CreateRoot("a3tools-missing");
            try
            {
                var service = new SteamCmdToolsDownloadService(new AppPaths(root));
                OperationResult result = service.DownloadMods("D:\\steam", "user", "pass", new ulong[] { 123UL });
                Assert.False(result.Success);
                Assert.Contains("steamcmdTools.exe", result.Message);
            }
            finally
            {
                AutomatedTestWorkspace.DeleteRoot(root);
            }
        }
    }
}
