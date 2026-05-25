using Arma3ServerTools.Core.Models;

namespace Arma3ServerTools.Core.Security
{
    /// <summary>
    /// Protects sensitive fields in server JSON configs with DPAPI (same strategy as Steam credentials).
    /// Plaintext values from older configs are preserved on load and encrypted on next save.
    /// </summary>
    public static class ServerConfigSecretProtector
    {
        private const string EncryptedPrefix = "A3ST_ENC:";

        public static void ProtectSecrets(ArmaServerConfig config)
        {
            if (config == null)
            {
                return;
            }

            EnsureNestedObjects(config);
            config.ServerConfig.Password = ProtectField(config.ServerConfig.Password);
            config.ServerConfig.ServerCommandPassword = ProtectField(config.ServerConfig.ServerCommandPassword);
            config.ServerConfig.PasswordAdmin = ProtectField(config.ServerConfig.PasswordAdmin);
            config.BattlEyeConfig.RConPassword = ProtectField(config.BattlEyeConfig.RConPassword);
        }

        public static void UnprotectSecrets(ArmaServerConfig config)
        {
            if (config == null)
            {
                return;
            }

            EnsureNestedObjects(config);
            config.ServerConfig.Password = UnprotectField(config.ServerConfig.Password);
            config.ServerConfig.ServerCommandPassword = UnprotectField(config.ServerConfig.ServerCommandPassword);
            config.ServerConfig.PasswordAdmin = UnprotectField(config.ServerConfig.PasswordAdmin);
            config.BattlEyeConfig.RConPassword = UnprotectField(config.BattlEyeConfig.RConPassword);
        }

        public static bool IsProtectedField(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return false;
            }

            return value.StartsWith(EncryptedPrefix, System.StringComparison.Ordinal);
        }

        private static void EnsureNestedObjects(ArmaServerConfig config)
        {
            if (config.ServerConfig == null)
            {
                config.ServerConfig = new ServerConfig();
            }

            if (config.BattlEyeConfig == null)
            {
                config.BattlEyeConfig = new BattlEye();
            }
        }

        private static string ProtectField(string value)
        {
            if (string.IsNullOrEmpty(value) || IsProtectedField(value))
            {
                return value;
            }

            return EncryptedPrefix + SecretProtector.Protect(value);
        }

        private static string UnprotectField(string value)
        {
            if (string.IsNullOrEmpty(value) || !IsProtectedField(value))
            {
                return value;
            }

            string payload = value.Substring(EncryptedPrefix.Length);
            return SecretProtector.Unprotect(payload);
        }
    }
}
