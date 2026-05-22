using System;
using System.Threading;
using System.Threading.Tasks;
using Arma3ServerTools.Application.Services;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    public class RconServiceTests
    {
        [Fact]
        public async Task GetPlayersAsync_WithoutConnect_Throws()
        {
            using (var service = new RconService())
            {
                await Assert.ThrowsAsync<InvalidOperationException>(
                    async () => await service.GetPlayersAsync().ConfigureAwait(false));
            }
        }

        [Fact]
        public async Task KickAsync_WithoutConnect_Throws()
        {
            using (var service = new RconService())
            {
                await Assert.ThrowsAsync<InvalidOperationException>(
                    async () => await service.KickAsync(1, "test").ConfigureAwait(false));
            }
        }

        [Fact]
        public async Task GetBansAsync_WithoutConnect_Throws()
        {
            using (var service = new RconService())
            {
                await Assert.ThrowsAsync<InvalidOperationException>(
                    async () => await service.GetBansAsync().ConfigureAwait(false));
            }
        }

        [Fact]
        public async Task ChangeRconPasswordAsync_WithoutConnect_Throws()
        {
            using (var service = new RconService())
            {
                await Assert.ThrowsAsync<InvalidOperationException>(
                    async () => await service.ChangeRconPasswordAsync("new-pass").ConfigureAwait(false));
            }
        }

        [Fact]
        public void SendMessageAsync_WithoutConnect_Throws()
        {
            using (var service = new RconService())
            {
                Assert.Throws<InvalidOperationException>(() => service.SendMessageAsync("hello").GetAwaiter().GetResult());
            }
        }
    }
}
