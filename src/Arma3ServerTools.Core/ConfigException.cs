using System;

namespace Arma3ServerTools.Core
{
    /// <summary>
    /// Raised when configuration read/write or validation fails.
    /// </summary>
    public sealed class ConfigException : Exception
    {
        public ConfigException(string message)
            : base(message)
        {
        }

        public ConfigException(string message, Exception innerException)
            : base(message, innerException)
        {
        }
    }
}
