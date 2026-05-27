namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdTerminationResult
    {
        public bool Success { get; set; }

        public int KilledProcessCount { get; set; }

        public bool GateWasHeld { get; set; }

        public bool GateReleased { get; set; }

        public string Message { get; set; }
    }

    public sealed class SteamCmdStatusSnapshot
    {
        public bool IsGateHeld { get; set; }

        public string CurrentOperation { get; set; }

        public int RunningProcessCount { get; set; }

        public int TrackedProcessId { get; set; }
    }
}
