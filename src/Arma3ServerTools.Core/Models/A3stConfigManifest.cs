using Arma3ServerTools.Core;

namespace Arma3ServerTools.Core.Models
{
    /// <summary>
    /// Lightweight header for an A3ST tool config package (config/{uuid}/manifest.json).
    /// </summary>
    public sealed class A3stConfigManifest
    {
        public int FormatVersion { get; set; } = ToolConstants.ToolConfigFormatVersion;

        public string ServerUUID { get; set; }

        public string ConfigName { get; set; }

        public string ServerDir { get; set; }

        public string CreateTime { get; set; }

        public string SaveTime { get; set; }

        public bool x64 { get; set; } = true;

        public bool AutoCopyBikey { get; set; } = true;

        public string StartCommandLine { get; set; }
    }
}
