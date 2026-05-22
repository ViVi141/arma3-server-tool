namespace Arma3ServerTools.Core
{
    /// <summary>
    /// Resolves application root paths (tool install directory, config folder, etc.).
    /// </summary>
    public interface IAppPaths
    {
        string ApplicationBase { get; }

        string ConfigDirectory { get; }
    }

    /// <summary>
    /// Default path layout: config/*.json under install root.
    /// </summary>
    public sealed class AppPaths : IAppPaths
    {
        public AppPaths(string applicationBase)
        {
            ApplicationBase = ResolveToolRoot(applicationBase);
            ConfigDirectory = System.IO.Path.Combine(ApplicationBase, "config");
        }

        /// <summary>
        /// When MonitoringHost runs from {ToolRoot}/monitoring/, data files stay under the tool root.
        /// </summary>
        public static string ResolveToolRoot(string processBase)
        {
            if (string.IsNullOrEmpty(processBase))
            {
                return processBase;
            }

            string normalized = processBase.TrimEnd(
                System.IO.Path.DirectorySeparatorChar,
                System.IO.Path.AltDirectorySeparatorChar);
            string folderName = System.IO.Path.GetFileName(normalized);
            if (string.Equals(folderName, "monitoring", System.StringComparison.OrdinalIgnoreCase))
            {
                return System.IO.Path.GetFullPath(System.IO.Path.Combine(normalized, ".."));
            }

            return processBase;
        }

        public string ApplicationBase { get; }

        public string ConfigDirectory { get; }
    }
}
