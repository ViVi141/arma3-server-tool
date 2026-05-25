using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Core.Repositories
{
    public sealed class SteamCmdLoadResult
    {
        private SteamCmdLoadResult(SteamcmdEntity settings, bool success, string errorMessage)
        {
            Settings = settings ?? new SteamcmdEntity();
            Success = success;
            ErrorMessage = errorMessage;
        }

        public SteamcmdEntity Settings { get; }

        public bool Success { get; }

        public string ErrorMessage { get; }

        public static SteamCmdLoadResult Ok(SteamcmdEntity settings)
        {
            return new SteamCmdLoadResult(settings, true, null);
        }

        public static SteamCmdLoadResult MissingFile()
        {
            return new SteamCmdLoadResult(new SteamcmdEntity(), true, null);
        }

        public static SteamCmdLoadResult Failed(string message)
        {
            return new SteamCmdLoadResult(new SteamcmdEntity(), false, message);
        }
    }
}
