namespace Arma3ServerTools.Application.Services
{
    /// <summary>
    /// Progress report for bundled SteamCMD download and bootstrap.
    /// </summary>
    public sealed class SteamCmdDownloadProgress
    {
        public SteamCmdDownloadProgress(string stage, int percent)
        {
            Stage = stage ?? string.Empty;
            Percent = percent;
        }

        /// <summary>User-visible status text.</summary>
        public string Stage { get; }

        /// <summary>0–100 when known; -1 for indeterminate (marquee).</summary>
        public int Percent { get; }
    }
}
