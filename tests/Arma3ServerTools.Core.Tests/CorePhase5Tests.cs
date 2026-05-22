using Arma3ServerTools.Core.Validation;
using Xunit;

namespace Arma3ServerTools.Core.Tests
{
    public class IPv4ToolsTests
    {
        [Fact]
        public void ValidateIPAddress_AcceptsValidAddress()
        {
            Assert.True(IPv4Tools.ValidateIPAddress("127.0.0.1"));
            Assert.True(IPv4Tools.ValidateIPAddress("192.168.0.10"));
        }

        [Fact]
        public void ValidateIPAddress_RejectsInvalidAddress()
        {
            Assert.False(IPv4Tools.ValidateIPAddress(string.Empty));
            Assert.False(IPv4Tools.ValidateIPAddress("999.1.1.1"));
            Assert.False(IPv4Tools.ValidateIPAddress("not-an-ip"));
        }
    }
}
