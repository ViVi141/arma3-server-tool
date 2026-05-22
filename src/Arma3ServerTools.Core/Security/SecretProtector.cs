using System;
using System.Security.Cryptography;
using System.Text;

namespace Arma3ServerTools.Core.Security
{
    /// <summary>
    /// Protects local secrets with Windows DPAPI; falls back to legacy AES for migration.
    /// </summary>
    public static class SecretProtector
    {
        private const string DpapiPrefix = "DPAPI1:";

        public static string Protect(string plainText)
        {
            if (string.IsNullOrEmpty(plainText))
            {
                return plainText;
            }

            byte[] plainBytes = Encoding.UTF8.GetBytes(plainText);
            byte[] protectedBytes = ProtectedData.Protect(
                plainBytes,
                GetOptionalEntropy(),
                DataProtectionScope.CurrentUser);
            return DpapiPrefix + Convert.ToBase64String(protectedBytes);
        }

        public static string Unprotect(string protectedText)
        {
            if (string.IsNullOrEmpty(protectedText))
            {
                return protectedText;
            }

            if (protectedText.StartsWith(DpapiPrefix, StringComparison.Ordinal))
            {
                string payload = protectedText.Substring(DpapiPrefix.Length);
                byte[] protectedBytes = Convert.FromBase64String(payload);
                byte[] plainBytes = ProtectedData.Unprotect(
                    protectedBytes,
                    GetOptionalEntropy(),
                    DataProtectionScope.CurrentUser);
                return Encoding.UTF8.GetString(plainBytes);
            }

            return AesEncryption.Decrypt(protectedText, MachineCodeTools.GetEncryptionKey());
        }

        public static bool UsesLegacyFormat(string protectedText)
        {
            if (string.IsNullOrEmpty(protectedText))
            {
                return false;
            }

            return !protectedText.StartsWith(DpapiPrefix, StringComparison.Ordinal);
        }

        private static byte[] GetOptionalEntropy()
        {
            string machineKey = MachineCodeTools.GetEncryptionKey();
            if (string.IsNullOrEmpty(machineKey))
            {
                return null;
            }

            return Encoding.UTF8.GetBytes(machineKey);
        }
    }
}
