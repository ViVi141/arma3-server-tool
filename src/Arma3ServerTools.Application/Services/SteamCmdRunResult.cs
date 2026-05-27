using System;

namespace Arma3ServerTools.Application.Services
{
    public sealed class SteamCmdRunResult
    {
        public bool Success { get; set; }

        public bool RequiresSteamGuard { get; set; }

        public int ExitCode { get; set; }

        public string StandardOutput { get; set; } = string.Empty;

        public string StandardError { get; set; } = string.Empty;

        public string CombinedText { get; set; } = string.Empty;

        public string LogFilePath { get; set; }

        public string Message { get; set; }

        public static bool OutputIndicatesSteamGuard(string combinedText)
        {
            if (string.IsNullOrWhiteSpace(combinedText))
            {
                return false;
            }

            if (combinedText.IndexOf("Steam Guard", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            if (combinedText.IndexOf("two-factor", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            if (combinedText.IndexOf("Login Failure", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            if (combinedText.IndexOf("Account Logon Denied", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return true;
            }

            return false;
        }

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
