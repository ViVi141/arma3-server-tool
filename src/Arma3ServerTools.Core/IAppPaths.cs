using System;
using System.IO;

namespace Arma3ServerTools.Core
{
    /// <summary>
    /// Resolves application root paths (tool install directory, config folder, etc.).
    /// </summary>
    public interface IAppPaths
    {
        /// <summary>Read-only install directory (exe, sql, mod templates).</summary>
        string ApplicationBase { get; }

        /// <summary>Writable data root (config, logs, databases, SteamCMD bundle).</summary>
        string UserDataDirectory { get; }

        string ConfigDirectory { get; }

        string LogDirectory { get; }
    }

    /// <summary>
    /// Default path layout: user data under install root when writable, otherwise LocalAppData.
    /// </summary>
    public sealed class AppPaths : IAppPaths
    {
        public const string UserDataFolderName = "Arma3ServerTools";

        public AppPaths(string applicationBase)
        {
            ApplicationBase = ResolveToolRoot(applicationBase);
            UserDataDirectory = ResolveUserDataDirectory(ApplicationBase);
            ConfigDirectory = Path.Combine(UserDataDirectory, "config");
            LogDirectory = Path.Combine(UserDataDirectory, "logs");
            TryMigrateLegacyUserData(ApplicationBase, UserDataDirectory);
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
                Path.DirectorySeparatorChar,
                Path.AltDirectorySeparatorChar);
            string folderName = Path.GetFileName(normalized);
            if (string.Equals(folderName, "monitoring", StringComparison.OrdinalIgnoreCase))
            {
                return Path.GetFullPath(Path.Combine(normalized, ".."));
            }

            return processBase;
        }

        public static string ResolveUserDataDirectory(string applicationBase)
        {
            if (string.IsNullOrWhiteSpace(applicationBase))
            {
                string fallback = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                return Path.Combine(fallback, UserDataFolderName);
            }

            if (IsDirectoryWritable(applicationBase))
            {
                return applicationBase;
            }

            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(localAppData, UserDataFolderName);
        }

        public string ApplicationBase { get; }

        public string UserDataDirectory { get; }

        public string ConfigDirectory { get; }

        public string LogDirectory { get; }

        internal static bool IsDirectoryWritable(string directoryPath)
        {
            if (string.IsNullOrWhiteSpace(directoryPath))
            {
                return false;
            }

            try
            {
                if (!Directory.Exists(directoryPath))
                {
                    Directory.CreateDirectory(directoryPath);
                }

                string probePath = Path.Combine(
                    directoryPath,
                    ".a3st-write-probe-" + Guid.NewGuid().ToString("N"));
                File.WriteAllText(probePath, "probe");
                File.Delete(probePath);
                return true;
            }
            catch (UnauthorizedAccessException)
            {
                return false;
            }
            catch (IOException)
            {
                return false;
            }
        }

        private static void TryMigrateLegacyUserData(string applicationBase, string userDataDirectory)
        {
            if (PathsEqual(applicationBase, userDataDirectory))
            {
                return;
            }

            Directory.CreateDirectory(userDataDirectory);
            TryMigrateFile(applicationBase, userDataDirectory, "data.json");
            TryMigrateFile(applicationBase, userDataDirectory, "moduleScanPath.json");
            TryMigrateFile(applicationBase, userDataDirectory, ToolConstants.StatisticsDatabaseFileName);
            TryMigrateFile(applicationBase, userDataDirectory, ToolConstants.PlayersDatabaseFileName);
            TryMigrateDirectory(applicationBase, userDataDirectory, "config");
            TryMigrateDirectoryIfComplete(applicationBase, userDataDirectory, "extension");
            TryMigrateDirectory(applicationBase, userDataDirectory, "logs");
        }

        private static void TryMigrateDirectoryIfComplete(
            string sourceRoot,
            string targetRoot,
            string directoryName)
        {
            string sourcePath = Path.Combine(sourceRoot, directoryName);
            if (!Directory.Exists(sourcePath))
            {
                return;
            }

            if (string.Equals(directoryName, "extension", StringComparison.OrdinalIgnoreCase)
                && !IsCompleteExtensionDirectory(sourcePath))
            {
                return;
            }

            TryMigrateDirectory(sourceRoot, targetRoot, directoryName);
        }

        private static bool IsCompleteExtensionDirectory(string extensionDirectory)
        {
            return File.Exists(Path.Combine(extensionDirectory, "steamcmd.exe"))
                && File.Exists(Path.Combine(extensionDirectory, "public", "steambootstrapper_english.txt"));
        }

        private static bool PathsEqual(string left, string right)
        {
            if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right))
            {
                return false;
            }

            return string.Equals(
                Path.GetFullPath(left).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
                Path.GetFullPath(right).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
                StringComparison.OrdinalIgnoreCase);
        }

        private static void TryMigrateFile(string sourceRoot, string targetRoot, string fileName)
        {
            string sourcePath = Path.Combine(sourceRoot, fileName);
            string targetPath = Path.Combine(targetRoot, fileName);
            if (!File.Exists(sourcePath) || File.Exists(targetPath))
            {
                return;
            }

            try
            {
                File.Copy(sourcePath, targetPath);
            }
            catch (Exception)
            {
            }
        }

        private static void TryMigrateDirectory(string sourceRoot, string targetRoot, string directoryName)
        {
            string sourcePath = Path.Combine(sourceRoot, directoryName);
            string targetPath = Path.Combine(targetRoot, directoryName);
            if (!Directory.Exists(sourcePath) || Directory.Exists(targetPath))
            {
                return;
            }

            try
            {
                CopyDirectory(sourcePath, targetPath);
            }
            catch (Exception)
            {
            }
        }

        private static void CopyDirectory(string sourcePath, string targetPath)
        {
            Directory.CreateDirectory(targetPath);
            foreach (string filePath in Directory.GetFiles(sourcePath, "*", SearchOption.AllDirectories))
            {
                string relativePath = filePath.Substring(sourcePath.Length).TrimStart(
                    Path.DirectorySeparatorChar,
                    Path.AltDirectorySeparatorChar);
                string destinationPath = Path.Combine(targetPath, relativePath);
                string destinationDirectory = Path.GetDirectoryName(destinationPath);
                if (!string.IsNullOrEmpty(destinationDirectory))
                {
                    Directory.CreateDirectory(destinationDirectory);
                }

                if (!File.Exists(destinationPath))
                {
                    File.Copy(filePath, destinationPath);
                }
            }
        }
    }
}
