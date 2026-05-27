using System.Threading;
using Arma3ServerTools.Application.Services;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    [Collection("SteamCmdGate")]
    public sealed class SteamCmdExecutionGateTests
    {
        [Fact]
        public void TryEnter_SecondCallerFailsWhenNoWait()
        {
            Assert.True(SteamCmdExecutionGate.TryEnter("first", 0, out string busy1));
            Assert.Null(busy1);
            Assert.False(SteamCmdExecutionGate.TryEnter("second", 0, out string busy2));
            Assert.False(string.IsNullOrWhiteSpace(busy2));
            SteamCmdExecutionGate.Exit();
        }

        [Fact]
        public void TryEnter_SecondCallerWaitsThenSucceeds()
        {
            Assert.True(SteamCmdExecutionGate.TryEnter("first", 0, out string _));
            bool entered = false;
            var thread = new Thread(
                () =>
                {
                    entered = SteamCmdExecutionGate.TryEnter("second", 3000, out string _);
                });
            thread.Start();
            Thread.Sleep(200);
            SteamCmdExecutionGate.Exit();
            thread.Join(5000);
            Assert.True(entered);
            SteamCmdExecutionGate.Exit();
        }

        [Fact]
        public void TerminateAll_ReleasesHeldGate()
        {
            Assert.True(SteamCmdExecutionGate.TryEnter("held", 0, out string _));
            SteamCmdTerminationResult result = SteamCmdExecutionGate.TerminateAll();
            Assert.True(result.GateReleased);
            Assert.True(SteamCmdExecutionGate.TryEnter("after-terminate", 0, out string busy));
            Assert.Null(busy);
            SteamCmdExecutionGate.Exit();
        }
    }
}
