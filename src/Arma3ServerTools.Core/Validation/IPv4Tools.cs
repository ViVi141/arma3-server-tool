using System.Text.RegularExpressions;

namespace Arma3ServerTools.Core.Validation
{
    public static class IPv4Tools
    {
        private static readonly Regex ValidIpRegex = new Regex(
            @"^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$",
            RegexOptions.Compiled);

        public static bool ValidateIPAddress(string ipAddress)
        {
            if (string.IsNullOrWhiteSpace(ipAddress))
            {
                return false;
            }

            return ValidIpRegex.IsMatch(ipAddress.Trim());
        }
    }
}
