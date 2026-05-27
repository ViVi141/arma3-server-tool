namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdRunResult
    {
        public bool Success { get; set; }

        public int ExitCode { get; set; }

        public string StandardOutput { get; set; } = string.Empty;

        public string StandardError { get; set; } = string.Empty;

        public string CombinedText { get; set; } = string.Empty;

        public string LogFilePath { get; set; }

        public string Message { get; set; }

        public string TailForDisplay(int maxChars)
        {
            if (string.IsNullOrEmpty(CombinedText))
            {
                return string.Empty;
            }

            if (CombinedText.Length <= maxChars)
            {
                return CombinedText;
            }

            return CombinedText.Substring(CombinedText.Length - maxChars);
        }
    }
}
