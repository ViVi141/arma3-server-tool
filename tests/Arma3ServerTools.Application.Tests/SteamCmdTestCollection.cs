using Arma3ServerTools.Application.Services;
using Xunit;

namespace Arma3ServerTools.Application.Tests
{
    /// <summary>
    /// Releases the global SteamCMD gate and kills stray steamcmd.exe before tests
    /// (CI/dev machines may have a real SteamCMD running).
    /// </summary>
    public sealed class SteamCmdTestGateFixture
    {
        public SteamCmdTestGateFixture()
        {
            SteamCmdExecutionGate.TerminateAll();
        }
    }

    [CollectionDefinition("SteamCmdGate")]
    public sealed class SteamCmdGateCollection : ICollectionFixture<SteamCmdTestGateFixture>
    {
    }
}
