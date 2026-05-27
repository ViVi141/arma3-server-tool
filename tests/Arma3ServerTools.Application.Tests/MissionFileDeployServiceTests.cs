using Arma3ServerTools.Application.Services;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public sealed class MissionFileDeployServiceTests
    {
        [Fact]
        public void SanitizePboFileName_RejectsPathTraversal()
        {
            Assert.Equal(string.Empty, MissionFileDeployService.SanitizePboFileName(@"..\evil.pbo"));
            Assert.Equal(string.Empty, MissionFileDeployService.SanitizePboFileName(@"C:\temp\a.pbo"));
        }

        [Fact]
        public void SanitizePboFileName_AcceptsSimpleName()
        {
            Assert.Equal("coop_01.Altis.pbo", MissionFileDeployService.SanitizePboFileName("coop_01.Altis.pbo"));
        }

        [Fact]
        public void SanitizePboFileName_AppendsExtensionWhenMissing()
        {
            Assert.Equal("mission.pbo", MissionFileDeployService.SanitizePboFileName("mission"));
        }
    }
}
