using System;
using System.Text;

namespace Arma3ServerTools.Core.Config
{
    internal static class GameConfigEncoding
    {
        public static bool TryDecodeBase64(string value, out string decoded)
        {
            decoded = string.Empty;
            if (string.IsNullOrEmpty(value))
            {
                return false;
            }

            try
            {
                decoded = Encoding.Default.GetString(Convert.FromBase64String(value));
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
